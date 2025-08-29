# Pointotech web site

## Build

```bash
node build.mjs
```

This will create a distribution bundle in the `dist` directory.

## Deploy

Upload the current contents of the `dist` directory to the production server (S3 bucket):

```bash
terraform init
terraform apply -auto-approve
```
