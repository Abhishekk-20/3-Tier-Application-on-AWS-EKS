# 3-Tier Application on AWS EKS

A production-style 3-tier application deployed on Amazon EKS with a React frontend, Flask API backend, PostgreSQL database, AWS Application Load Balancer, and HTTPS.

> Note: Account-specific values are represented by placeholders. Never commit passwords, AWS keys, private keys, or live Kubernetes Secret values.

## Overview

This project demonstrates a full end-to-end deployment of a containerized application on AWS:

- Frontend: React + Nginx
- Backend: Flask + Gunicorn
- Database: PostgreSQL
- Orchestration: Amazon EKS / Kubernetes
- Ingress: AWS ALB
- TLS: AWS ACM
- DNS: GoDaddy
- Image Registry: Amazon ECR

## Architecture

The application follows a standard public-facing 3-tier flow. Users access the site through a public DNS name, traffic is received by the AWS Application Load Balancer, routed through the EKS ingress, and then served by the frontend and backend services. The backend connects to PostgreSQL for persistent data storage.

```text
User
 |
 v
https://www.smokebyte.space
 |
 v
GoDaddy DNS
 |
 v
AWS ALB (80/443)
 |  HTTPS termination via ACM
 |  HTTP redirected to HTTPS
 v
EKS Ingress
 |
 +-----------------------+
 |                       |
 v                       v
Frontend Service        Backend Service
React + Nginx           Flask + Gunicorn
:80                     :8000
                           |
                           v
                     PostgreSQL
                       :5432
```

## Tech Stack

| Layer | Technology |
|---|---|
| Cloud | AWS |
| Containers | Docker + Amazon ECR |
| Orchestration | Kubernetes + Amazon EKS |
| Frontend | React + Nginx |
| Backend | Flask + Gunicorn |
| Database | PostgreSQL |
| Ingress | AWS Load Balancer Controller + ALB |
| HTTPS | ACM |
| DNS | GoDaddy |
| Package Manager | Helm |

## Deployment Flow

```text
Build Docker images
    ↓
Push images to Amazon ECR
    ↓
Deploy PostgreSQL
    ↓
Run database migration
    ↓
Deploy backend service
    ↓
Deploy frontend service
    ↓
Install AWS Load Balancer Controller
    ↓
Create Kubernetes Ingress
    ↓
Configure ACM HTTPS certificate
    ↓
Point GoDaddy CNAME to ALB
    ↓
Access application at https://www.smokebyte.space
```

## 1. Push Container Images to ECR

Log in to ECR:

```bash
aws ecr get-login-password --region ap-south-1 | \
docker login --username AWS --password-stdin \
<AWS_ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com
```

Build the frontend and backend images:

```bash
docker build -t 3-tier-frontend:v1 ./frontend
docker build -t 3-tier-backend:v1 ./backend
```

Tag and push them to ECR:

```bash
docker tag 3-tier-frontend:v1 \
<AWS_ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com/3-tier-frontend:v1

docker tag 3-tier-backend:v1 \
<AWS_ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com/3-tier-backend:v1

docker push <AWS_ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com/3-tier-frontend:v1
docker push <AWS_ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com/3-tier-backend:v1
```

## 2. Configure Kubernetes Resources

Create the namespace:

```bash
kubectl apply -f k8s/namespace.yaml
```

Generate a database password:

```bash
DB_PASSWORD=$(openssl rand -hex 16)
```

Create the Kubernetes Secret without storing sensitive values in Git:

```bash
kubectl create secret generic db-secrets \
  -n 3-tier-app-eks \
  --from-literal=DB_USERNAME="<DB_USERNAME>" \
  --from-literal=DB_PASSWORD="$DB_PASSWORD" \
  --from-literal=SECRET_KEY="$(openssl rand -hex 32)" \
  --from-literal=DATABASE_URL="postgresql://<DB_USERNAME>:${DB_PASSWORD}@postgres-db.3-tier-app-eks.svc.cluster.local:5432/postgres" \
  --dry-run=client -o yaml | kubectl apply -f -
```

Apply the application config and database service manifests:

```bash
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/database-service.yaml
```

Verify the resources:

```bash
kubectl get pods -n 3-tier-app-eks
kubectl get svc -n 3-tier-app-eks
```

## 3. Run Database Migration

```bash
kubectl apply -f k8s/migration_job.yaml
kubectl get jobs -n 3-tier-app-eks
```

Expected output:

```text
database-migration   Complete   1/1
```

## 4. Deploy the Backend and Frontend

```bash
kubectl apply -f k8s/backend.yaml
kubectl apply -f k8s/frontend.yaml
```

Verify the application services:

```bash
kubectl get pods -n 3-tier-app-eks
kubectl get svc -n 3-tier-app-eks
```

Expected services:

```text
frontend      ClusterIP   80
backend       ClusterIP   8000
postgres-db   ClusterIP   5432
```

## 5. Install the AWS Load Balancer Controller

The AWS Load Balancer Controller converts the Kubernetes Ingress into an AWS Application Load Balancer.

```bash
helm repo add eks https://aws.github.io/eks-charts
helm repo update
```

Install the controller:

```bash
helm install aws-load-balancer-controller \
  eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=3-tier-cluster \
  --set region=ap-south-1 \
  --set vpcId=<VPC_ID> \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller
```

Verify installation:

```bash
kubectl get pods -n kube-system | grep aws-load-balancer
kubectl get ingressclass
```

## 6. Configure Ingress and HTTPS

Important Ingress annotations:

```yaml
annotations:
  alb.ingress.kubernetes.io/scheme: internet-facing
  alb.ingress.kubernetes.io/target-type: ip
  alb.ingress.kubernetes.io/listen-ports: '[{"HTTP":80},{"HTTPS":443}]'
  alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:<AWS_REGION>:<AWS_ACCOUNT_ID>:certificate/<CERTIFICATE_ID>
  alb.ingress.kubernetes.io/ssl-redirect: '443'
```

Traffic routing:

```text
/       → frontend:80
/api    → backend:8000
```

Apply the ingress:

```bash
kubectl apply -f k8s/ingress.yaml
kubectl get ingress -n 3-tier-app-eks
```

## 7. Request and Validate an ACM Certificate

Request a certificate:

```bash
aws acm request-certificate \
  --domain-name smokebyte.space \
  --subject-alternative-names "*.smokebyte.space" \
  --validation-method DNS \
  --region ap-south-1
```

Add the validation CNAME to GoDaddy, then wait until the certificate is issued:

```bash
aws acm describe-certificate \
  --certificate-arn "<CERTIFICATE_ARN>" \
  --region ap-south-1 \
  --query "Certificate.Status" \
  --output text
```

Expected result:

```text
ISSUED
```

Keep the ACM DNS validation record in place for future certificate renewal.

## 8. Point DNS to the ALB

Configure the existing `www` CNAME to target the ALB:

```text
Type:  CNAME
Name:  www
Value: <ALB_DNS_NAME>
TTL:   600
```

Route 53 is not required for this `www` setup.

## 9. Final Verification

Check the frontend:

```bash
curl -I https://www.smokebyte.space
```

Expected response:

```text
HTTP/2 200
```

Check the API:

```bash
curl -i https://www.smokebyte.space/api/topics
```

Check the cluster state:

```bash
kubectl get nodes
kubectl get pods -n 3-tier-app-eks
kubectl get svc -n 3-tier-app-eks
kubectl get ingress -n 3-tier-app-eks
```

The application should look like this when the deployment is working correctly:

<img width="1358" height="724" alt="image" src="https://github.com/user-attachments/assets/e3cd3fdb-eed1-4118-adc0-8bd0b3806d5d" />


## Troubleshooting

```bash
kubectl describe ingress 3-tier-app-ingress -n 3-tier-app-eks
kubectl get events -n 3-tier-app-eks --sort-by=.metadata.creationTimestamp
kubectl logs -n 3-tier-app-eks deployment/backend
kubectl logs -n 3-tier-app-eks deployment/frontend
nslookup www.smokebyte.space 8.8.8.8
```

## Cleanup

Delete the ingress first so the AWS Load Balancer Controller can clean up the ALB:

```bash
kubectl delete ingress 3-tier-app-ingress -n 3-tier-app-eks
```

Then remove the EKS cluster:

```bash
eksctl delete cluster --name 3-tier-cluster --region ap-south-1
```

Delete ECR repositories when they are no longer needed:

```bash
aws ecr delete-repository --repository-name 3-tier-frontend --force --region ap-south-1
aws ecr delete-repository --repository-name 3-tier-backend --force --region ap-south-1
```

## Result

```text
Docker Images       → Amazon ECR
Kubernetes          → Amazon EKS
Frontend            → React + Nginx
Backend             → Flask + Gunicorn
Database            → PostgreSQL
Ingress             → AWS ALB
TLS                 → AWS ACM
DNS                 → GoDaddy
Public URL          → https://www.smokebyte.space
```

This project demonstrates an end-to-end containerized 3-tier deployment using Docker, Kubernetes, EKS, ECR, ALB Ingress, IAM integration, DNS, and HTTPS.

## Project Goals

- Build and deploy a cloud-native application on Amazon EKS
- Containerize the frontend and backend services
- Manage secrets securely with Kubernetes
- Route traffic through a managed AWS load balancer
- Secure application access with ACM-managed TLS certificates
- Showcase a realistic production deployment flow

## Notes

- Replace placeholder values such as `<AWS_ACCOUNT_ID>`, `<VPC_ID>`, `<DB_USERNAME>`, and `<CERTIFICATE_ARN>` with your real environment values.
- Keep all credentials and secret material out of Git repositories.
- This setup is intended for learning, demonstration, and deployment practice in a controlled AWS environment.
