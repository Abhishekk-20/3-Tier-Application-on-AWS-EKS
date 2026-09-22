#!/bin/bash
set +e

REGION="ap-south-1"
CLUSTER="3-tier-cluster"
NAMESPACE="3-tier-app-eks"
ACCOUNT_ID="400790842570"
POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/AWSLoadBalancerControllerIAMPolicy"

echo "========== 1. Delete Ingress / ALB =========="
kubectl delete ingress 3-tier-app-ingress \
  -n "$NAMESPACE" \
  --ignore-not-found=true

echo "Waiting 90 seconds for ALB cleanup..."
sleep 90

echo "========== 2. Delete EKS Cluster =========="
eksctl delete cluster \
  --name "$CLUSTER" \
  --region "$REGION"

echo "========== 3. Delete ECR Repositories =========="
aws ecr delete-repository \
  --repository-name 3-tier-frontend \
  --force \
  --region "$REGION" 2>/dev/null || true

aws ecr delete-repository \
  --repository-name 3-tier-backend \
  --force \
  --region "$REGION" 2>/dev/null || true

echo "========== 4. Delete ALB Controller IAM Policy =========="
aws iam delete-policy \
  --policy-arn "$POLICY_ARN" 2>/dev/null || true

echo "========== 5. Check Remaining Resources =========="

echo "--- EKS ---"
aws eks list-clusters --region "$REGION"

echo "--- Load Balancers ---"
aws elbv2 describe-load-balancers \
  --region "$REGION" \
  --query 'LoadBalancers[*].[LoadBalancerName,State.Code]' \
  --output table

echo "--- EC2 ---"
aws ec2 describe-instances \
  --region "$REGION" \
  --filters "Name=instance-state-name,Values=pending,running,stopping,stopped" \
  --query 'Reservations[*].Instances[*].[InstanceId,State.Name,InstanceType]' \
  --output table

echo "--- NAT Gateways ---"
aws ec2 describe-nat-gateways \
  --region "$REGION" \
  --filter "Name=state,Values=available,pending" \
  --query 'NatGateways[*].[NatGatewayId,State,VpcId]' \
  --output table

echo "--- EBS Volumes ---"
aws ec2 describe-volumes \
  --region "$REGION" \
  --query 'Volumes[*].[VolumeId,State,Size]' \
  --output table

echo "========== CLEANUP FINISHED =========="
