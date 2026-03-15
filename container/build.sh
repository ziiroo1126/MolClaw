#!/bin/bash
# Build the BioClaw agent container image

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
WORKSPACE_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ODESIGN_SRC="${WORKSPACE_ROOT}/ODesign"
ODESIGN_BUNDLE_DIR="${SCRIPT_DIR}/odesign-bundle"

IMAGE_NAME="bioclaw-agent"
TAG="${1:-latest}"

if [[ ! -d "${ODESIGN_SRC}" ]]; then
  echo "Missing ODesign source directory: ${ODESIGN_SRC}" >&2
  exit 1
fi

REQUIRED_ODESIGN_PATHS=(
  "requirements.txt"
  "scripts/inference.py"
  "inference_demo.sh"
  "data/components.v20240608.cif"
  "data/components.v20240608.cif.rdkit_mol.pkl"
  "ckpt/ckpt/odesign_base_prot_flex.pt"
  "ckpt/ckpt/odesign_base_prot_rigid.pt"
  "ckpt/ckpt/odesign_base_ligand_rigid.pt"
  "ckpt/ckpt/odesign_base_na_rigid.pt"
  "ckpt/ckpt/oinvfold_protein.ckpt"
  "ckpt/ckpt/oinvfold_ligand.ckpt"
  "ckpt/ckpt/oinvfold_dna.ckpt"
  "ckpt/ckpt/oinvfold_rna.ckpt"
)

for rel_path in "${REQUIRED_ODESIGN_PATHS[@]}"; do
  if [[ ! -e "${ODESIGN_SRC}/${rel_path}" ]]; then
    echo "Missing required ODesign asset: ${ODESIGN_SRC}/${rel_path}" >&2
    exit 1
  fi
done

cleanup() {
  rm -rf "${ODESIGN_BUNDLE_DIR}"
}
trap cleanup EXIT

echo "Preparing ODesign bundle for image build..."
rm -rf "${ODESIGN_BUNDLE_DIR}"
mkdir -p "${ODESIGN_BUNDLE_DIR}"

if cp -a -l "${ODESIGN_SRC}/." "${ODESIGN_BUNDLE_DIR}/" 2>/dev/null; then
  echo "Using hard-linked ODesign staging directory."
else
  echo "Hard-link staging unavailable; falling back to full copy."
  cp -a "${ODESIGN_SRC}/." "${ODESIGN_BUNDLE_DIR}/"
fi

rm -rf "${ODESIGN_BUNDLE_DIR}/.git"
find "${ODESIGN_BUNDLE_DIR}" -type d -name "__pycache__" -prune -exec rm -rf {} +
find "${ODESIGN_BUNDLE_DIR}" -type f -name "*.pyc" -delete

echo "Building BioClaw agent container image..."
echo "Image: ${IMAGE_NAME}:${TAG}"
echo "Bundled ODesign source: ${ODESIGN_SRC}"

# Build with Docker
docker build -t "${IMAGE_NAME}:${TAG}" .

echo ""
echo "Build complete!"
echo "Image: ${IMAGE_NAME}:${TAG}"
echo ""
echo "Test with:"
echo "  echo '{\"prompt\":\"What is 2+2?\",\"groupFolder\":\"test\",\"chatJid\":\"test@g.us\",\"isMain\":false}' | docker run -i ${IMAGE_NAME}:${TAG}"
