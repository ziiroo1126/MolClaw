#!/bin/bash
# Build the BioClaw agent container image

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
WORKSPACE_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ODESIGN_REQUIREMENTS_SRC="${WORKSPACE_ROOT}/ODesign/requirements.txt"
ODESIGN_REQUIREMENTS_DST="${SCRIPT_DIR}/odesign-requirements.txt"

IMAGE_NAME="bioclaw-agent"
TAG="${1:-latest}"

if [[ ! -f "${ODESIGN_REQUIREMENTS_SRC}" ]]; then
  echo "Missing ODesign requirements file: ${ODESIGN_REQUIREMENTS_SRC}" >&2
  exit 1
fi

cleanup() {
  rm -f "${ODESIGN_REQUIREMENTS_DST}"
}
trap cleanup EXIT

cp "${ODESIGN_REQUIREMENTS_SRC}" "${ODESIGN_REQUIREMENTS_DST}"

echo "Building BioClaw agent container image..."
echo "Image: ${IMAGE_NAME}:${TAG}"

# Build with Docker
docker build -t "${IMAGE_NAME}:${TAG}" .

echo ""
echo "Build complete!"
echo "Image: ${IMAGE_NAME}:${TAG}"
echo ""
echo "Test with:"
echo "  echo '{\"prompt\":\"What is 2+2?\",\"groupFolder\":\"test\",\"chatJid\":\"test@g.us\",\"isMain\":false}' | docker run -i ${IMAGE_NAME}:${TAG}"
