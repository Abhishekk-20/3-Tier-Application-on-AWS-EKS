3-Tier Application on AWS EKS

Production-style 3-tier application deployed on Amazon EKS with a React/Nginx frontend, Flask/Gunicorn backend, PostgreSQL, AWS ALB, and HTTPS.

Account-specific values are represented by placeholders. Never commit passwords, AWS keys, private keys, or live Kubernetes Secret values.

Architecture

User
 |
 v
https://www.smokebyte.space
 |
 v
GoDaddy DNS (CNAME)
 |
 v
AWS ALB :80/:443
 |  HTTP -> HTTPS
 |  ACM TLS Certificate
 v
EKS Ingress
 |------------------|
 v                  v
Frontend            Backend
React/Nginx         Flask/Gunicorn
:80                 :8000
                      |
                      v
                 PostgreSQL
                    :5432

Tech Stack

Layer

Technology

Cloud

AWS

Containers

Docker + Amazon ECR

Orchestration

Amazon EKS / Kubernetes

Frontend

React + Nginx

Backend

Flask + Gunicorn

Database

PostgreSQL

Ingress

AWS Load Balancer Controller + ALB

HTTPS

AWS Certificate Manager

DNS

GoDaddy

Package Manager

Helm

Deployment Flow

Docker Build
    ↓
Push Images to ECR
    ↓
Deploy PostgreSQL
    ↓
Run DB Migration
    ↓
Deploy Backend
    ↓
Deploy Frontend
    ↓
Install ALB Controller
    ↓
Create Ingress
    ↓
Configure ACM HTTPS
    ↓
GoDaddy CNAME → ALB
    ↓
https://www.smokebyte.space

1. ECR Images

Login to ECR:

aws ecr get-login-password --region ap-south-1 | \
docker login --username AWS --password-stdin \
<AWS_ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com

Build:

docker build -t 3-tier-frontend:v1 ./frontend
docker build -t 3-tier-backend:v1 ./backend

Tag and push:

docker tag 3-tier-frontend:v1 \
<AWS_ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com/3-tier-frontend:v1

docker tag 3-tier-backend:v1 \
<AWS_ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com/3-tier-backend:v1

docker push <AWS_ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com/3-tier-frontend:v1
docker push <AWS_ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com/3-tier-backend:v1

2. Kubernetes Configuration

Create namespace:

kubectl apply -f k8s/namespace.yaml

Generate a database password:

DB_PASSWORD=$(openssl rand -hex 16)

Create the Secret without storing the password in Git:

kubectl create secret generic db-secrets \
  -n 3-tier-app-eks \
  --from-literal=DB_USERNAME="<DB_USERNAME>" \
  --from-literal=DB_PASSWORD="$DB_PASSWORD" \
  --from-literal=SECRET_KEY="$(openssl rand -hex 32)" \
  --from-literal=DATABASE_URL="postgresql://<DB_USERNAME>:${DB_PASSWORD}@postgres-db.3-tier-app-eks.svc.cluster.local:5432/postgres" \
  --dry-run=client -o yaml | kubectl apply -f -

Apply application configuration and database:

kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/database-service.yaml

Verify:

kubectl get pods -n 3-tier-app-eks
kubectl get svc -n 3-tier-app-eks

3. Database Migration

kubectl apply -f k8s/migration_job.yaml
kubectl get jobs -n 3-tier-app-eks

Expected:

database-migration   Complete   1/1

4. Deploy Backend and Frontend

kubectl apply -f k8s/backend.yaml
kubectl apply -f k8s/frontend.yaml

Verify:

kubectl get pods -n 3-tier-app-eks
kubectl get svc -n 3-tier-app-eks

Expected services:

frontend      ClusterIP   80
backend       ClusterIP   8000
postgres-db   ClusterIP   5432

5. AWS Load Balancer Controller

The controller converts the Kubernetes Ingress into an AWS Application Load Balancer.

helm repo add eks https://aws.github.io/eks-charts
helm repo update

Install:

helm install aws-load-balancer-controller \
  eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=3-tier-cluster \
  --set region=ap-south-1 \
  --set vpcId=<VPC_ID> \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller

Verify:

kubectl get pods -n kube-system | grep aws-load-balancer
kubectl get ingressclass

6. Ingress and HTTPS

Important Ingress annotations:

annotations:
  alb.ingress.kubernetes.io/scheme: internet-facing
  alb.ingress.kubernetes.io/target-type: ip
  alb.ingress.kubernetes.io/listen-ports: '[{"HTTP":80},{"HTTPS":443}]'
  alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:<AWS_REGION>:<AWS_ACCOUNT_ID>:certificate/<CERTIFICATE_ID>
  alb.ingress.kubernetes.io/ssl-redirect: '443'

Routing:

/       → frontend:80
/api    → backend:8000

Apply:

kubectl apply -f k8s/ingress.yaml
kubectl get ingress -n 3-tier-app-eks

7. ACM Certificate

Request a certificate:

aws acm request-certificate \
  --domain-name smokebyte.space \
  --subject-alternative-names "*.smokebyte.space" \
  --validation-method DNS \
  --region ap-south-1

Add the ACM-provided validation CNAME to GoDaddy and wait until:

aws acm describe-certificate \
  --certificate-arn "<CERTIFICATE_ARN>" \
  --region ap-south-1 \
  --query "Certificate.Status" \
  --output text

returns:

ISSUED

Keep the ACM validation CNAME in DNS for certificate renewal.

8. GoDaddy DNS

Point the existing www CNAME to the ALB:

Type:  CNAME
Name:  www
Value: <ALB_DNS_NAME>
TTL:   600

Route 53 is not required for this www setup.

9. Final Verification

Frontend:

curl -I https://www.smokebyte.space

Expected:

HTTP/2 200

API:

curl -i https://www.smokebyte.space/api/topics

Check Kubernetes:

kubectl get nodes
kubectl get pods -n 3-tier-app-eks
kubectl get svc -n 3-tier-app-eks
kubectl get ingress -n 3-tier-app-eks

Troubleshooting

kubectl describe ingress 3-tier-app-ingress -n 3-tier-app-eks
kubectl get events -n 3-tier-app-eks --sort-by=.metadata.creationTimestamp
kubectl logs -n 3-tier-app-eks deployment/backend
kubectl logs -n 3-tier-app-eks deployment/frontend
nslookup www.smokebyte.space 8.8.8.8

Cleanup

Delete the Ingress first so the ALB Controller can remove the ALB:

kubectl delete ingress 3-tier-app-ingress -n 3-tier-app-eks

Then delete the cluster:

eksctl delete cluster --name 3-tier-cluster --region ap-south-1

Delete ECR repositories when no longer required:

aws ecr delete-repository --repository-name 3-tier-frontend --force --region ap-south-1
aws ecr delete-repository --repository-name 3-tier-backend --force --region ap-south-1

Result

Docker Images       → Amazon ECR
Kubernetes          → Amazon EKS
Frontend            → React/Nginx
Backend             → Flask/Gunicorn
Database            → PostgreSQL
Ingress             → AWS ALB
TLS                 → AWS ACM
DNS                 → GoDaddy
Public URL          → https://www.smokebyte.space

This project demonstrates an end-to-end containerized 3-tier deployment using Docker, Kubernetes, EKS, ECR, ALB Ingress, IAM integration, DNS, and HTTPS.
