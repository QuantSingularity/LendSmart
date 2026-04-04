# LendSmart Infrastructure

Production-grade infrastructure for the LendSmart platform, covering:

- **Terraform** — AWS provisioning (VPC, EC2 + ASG, RDS, S3, CloudFront, IAM, CloudWatch)
- **Kubernetes** — Deployments, Services, Ingress, RBAC, NetworkPolicy, HPA, monitoring, logging
- **Ansible** — Server provisioning, hardening, database and web-server configuration
- **Docker** — Multi-stage Dockerfiles for backend, frontend, and database; Compose for local dev

---

## Directory Layout

```
infrastructure/
├── docker/                         # Dockerfiles & container config
│   ├── Dockerfile.backend          # Node.js multi-stage (non-root, dumb-init)
│   ├── Dockerfile.frontend         # React + Nginx multi-stage (non-root)
│   ├── Dockerfile.database         # MySQL 8 with custom config
│   ├── nginx-frontend.conf         # Nginx SPA routing + API proxy
│   ├── mysql-custom.cnf            # MySQL tuning
│   └── .dockerignore
├── docker-compose.yml              # Local development (health-check ordering)
├── docker-compose.prod.yml         # Production override (resource limits, no exposed DB ports)
├── .env.example                    # Environment variable template
├── terraform/
│   ├── main.tf                     # Root module — wires all child modules
│   ├── variables.tf                # Root variables with validation
│   ├── outputs.tf                  # Root outputs
│   ├── backend.tf                  # S3 backend instructions (uncomment to activate)
│   ├── terraform.tfvars.example    # Copy → terraform.tfvars
│   ├── .terraform-version          # 1.6.6 (used by tfenv)
│   ├── .tflint.hcl
│   ├── environments/
│   │   ├── dev/terraform.tfvars
│   │   ├── staging/terraform.tfvars
│   │   └── prod/terraform.tfvars
│   └── modules/
│       ├── compute/                # ASG, Launch Template, ALB (HTTPS), Target Group
│       ├── database/               # RDS MySQL, optional Aurora cluster
│       ├── network/                # VPC, subnets, NAT GW, CloudFront (optional)
│       ├── security/               # ALB SG, App SG, DB SG, IAM role + instance profile
│       ├── storage/                # S3 bucket (encrypted, versioned, access-logged)
│       └── cost_optimization/      # Scale-out + scale-in policies, S3 lifecycle rules
├── kubernetes/
│   ├── base/                       # Plain Kubernetes manifests (no Helm templating)
│   │   ├── app-secrets.yaml        # Secret template (populate via external secrets operator)
│   │   ├── backend-deployment.yaml
│   │   ├── backend-service.yaml
│   │   ├── frontend-deployment.yaml
│   │   ├── frontend-service.yaml
│   │   ├── database-statefulset.yaml
│   │   ├── database-service.yaml   # Headless service for StatefulSet
│   │   ├── redis-deployment.yaml
│   │   ├── redis-service.yaml
│   │   ├── redis-pvc.yaml
│   │   ├── ingress.yaml            # spec.ingressClassName (K8s 1.18+)
│   │   ├── network-policy.yaml     # Zero-trust: deny-all + explicit allow rules + DNS
│   │   ├── hpa.yaml                # HorizontalPodAutoscaler v2 (CPU + memory)
│   │   ├── poddisruptionbudget.yaml
│   │   ├── configmap.yaml          # Non-secret app configuration
│   │   ├── monitoring.yaml         # Prometheus + Grafana (PVC-backed)
│   │   └── logging-agent.yaml      # Fluentd DaemonSet with RBAC
│   ├── environments/
│   │   ├── dev/values.yaml
│   │   ├── staging/values.yaml
│   │   └── prod/values.yaml
│   └── rbac/
│       ├── serviceaccount.yaml
│       ├── role.yaml
│       └── rolebinding.yaml
└── ansible/
    ├── ansible.cfg
    ├── inventory/
    │   ├── hosts.yml               # Static inventory (replace IPs; or use aws_ec2 plugin)
    │   └── hosts.example.yml
    ├── group_vars/
    │   └── all.example.yml
    └── playbooks/
        ├── main.yml
        ├── security_hardening.yml  # OS-family-aware (RedHat + Debian)
        └── roles/
            ├── common/             # Package install, timezone, firewall
            ├── webserver/          # Nginx, TLS, security headers
            └── database/           # MariaDB, community.mysql.* modules
```

---

## Quick Start

### 1 · Local development with Docker Compose

```bash
cd infrastructure
cp .env.example .env
# Edit .env with your values
docker compose up --build
```

Services:
| Service | URL |
|----------|------------------------|
| Frontend | http://localhost:80 |
| Backend | http://localhost:3000 |
| MySQL | localhost:3306 |
| Redis | localhost:6379 |

### 2 · Terraform (AWS)

```bash
cd terraform

# First-time setup
terraform init

# Deploy a specific environment
terraform plan  -var-file=environments/dev/terraform.tfvars
terraform apply -var-file=environments/dev/terraform.tfvars
```

> **Secrets** — never store `db_password` in tfvars committed to git.  
> Use `TF_VAR_db_password` env-var or AWS Secrets Manager with a data source.

#### Enable S3 remote state (recommended for teams)

Uncomment the `backend "s3"` block in `backend.tf` and follow the instructions in that file.

### 3 · Kubernetes

```bash
cd kubernetes

# Create namespace secrets first (use External Secrets Operator in production)
kubectl apply -f base/app-secrets.yaml

# Apply all base manifests
kubectl apply -f base/

# Apply environment-specific overrides (if using kustomize or Helm)
# kubectl apply -k environments/dev/
```

> **Grafana admin password** — populate the `admin-password` key in the
> `grafana-admin-secret` Secret before deploying `monitoring.yaml`.

### 4 · Ansible

```bash
cd ansible

# Install required collections
ansible-galaxy collection install community.mysql community.general ansible.posix

# Edit inventory/hosts.yml with your server IPs

# Run full provisioning
ansible-playbook playbooks/main.yml

# Security hardening only
ansible-playbook playbooks/security_hardening.yml
```

---

## Environment Architecture

| Environment | VPC CIDR    | Instance | DB Class     | ASG  |
| ----------- | ----------- | -------- | ------------ | ---- |
| dev         | 10.0.0.0/16 | t3.micro | db.t3.micro  | 1–3  |
| staging     | 10.1.0.0/16 | t3.small | db.t3.small  | 2–4  |
| prod        | 10.2.0.0/16 | t3.large | db.r6g.large | 2–10 |

Prod automatically enables: Multi-AZ RDS, deletion protection, final snapshot.

---

## Security Posture

- **Network** — Internet traffic hits the ALB only. EC2 instances are in private subnets and accept traffic only from the ALB security group on port 3000. Databases accept only from the app security group on port 3306.
- **IAM** — EC2 instances get a least-privilege instance profile: SSM (no SSH keys required in prod), CloudWatch agent, and optional S3 read-only.
- **Encryption** — RDS encrypted at rest (AES-256 / KMS), S3 SSE-AES256, HTTPS enforced at the ALB (TLS 1.2+) and at Nginx.
- **Kubernetes** — Zero-trust NetworkPolicy (deny-all default, explicit per-workload rules), non-root containers, `readOnlyRootFilesystem`, dropped Linux capabilities, topology spread.
- **Secrets** — No plaintext secrets in manifests. Use External Secrets Operator / Sealed Secrets / AWS Secrets Manager CSI driver for production.

---

## Required Ansible Collections

```bash
ansible-galaxy collection install \
  community.mysql \
  community.general \
  ansible.posix \
  amazon.aws
```
