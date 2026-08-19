# Render Web Service fallback: the real image is built by CI and pushed to
# GHCR (see .github/workflows/ci-cd.yml). This wrapper only lets Render's
# generic "Web Service" flow pull that image. The recommended setup is the
# Blueprint (render.yaml, runtime: image) which pulls GHCR directly.
FROM ghcr.io/imtarget05/taskflow-server:latest
