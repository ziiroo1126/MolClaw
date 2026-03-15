# BioClaw Agent Container
# Runs Claude Agent SDK in isolated Linux VM with biology tools and browser automation

FROM node:22-slim
SHELL ["/bin/bash", "-lc"]

ENV CONDA_DIR=/opt/conda
ENV PATH=${CONDA_DIR}/bin:${PATH}
ENV ODESIGN_REPO_DIR=/workspace/odesign
ENV CUTLASS_PATH=/opt/odesign/cutlass
ENV LAYERNORM_TYPE=fast_layernorm

# Install system dependencies for Chromium + bio tools
RUN apt-get update && apt-get install -y \
    # --- Browser automation ---
    chromium \
    fonts-liberation \
    fonts-noto-cjk \
    fonts-wqy-zenhei \
    fonts-noto-color-emoji \
    libgbm1 \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libasound2 \
    libpangocairo-1.0-0 \
    libcups2 \
    libdrm2 \
    libxshmfence1 \
    # --- Core utilities ---
    curl \
    git \
    wget \
    unzip \
    ca-certificates \
    build-essential \
    cmake \
    g++ \
    libjpeg-dev \
    libpng-dev \
    libgl1 \
    libglib2.0-0 \
    fontconfig \
    # --- Biology tools (apt) ---
    ncbi-blast+ \
    samtools \
    bedtools \
    fastqc \
    bwa \
    minimap2 \
    seqtk \
    fastp \
    bcftools \
    seqkit \
    pigz \
    tabix \
    sra-toolkit \
    salmon \
    kallisto \
    # --- Python for bio libraries ---
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Install Python biology libraries
RUN pip3 install --no-cache-dir --break-system-packages \
    biopython \
    pandas \
    numpy \
    scipy \
    matplotlib \
    seaborn \
    scikit-learn \
    rdkit-pypi \
    pydeseq2 \
    scanpy \
    anndata \
    pysam \
    requests \
    multiqc

# Install Miniconda and create a dedicated ODesign environment (Python 3.10)
RUN wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O /tmp/install-conda.sh \
    && bash /tmp/install-conda.sh -b -p "${CONDA_DIR}" \
    && rm -f /tmp/install-conda.sh \
    && conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/main \
    && conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/r \
    && conda create -y -n odesign python=3.10 \
    && conda clean -afy

# Install ODesign Python dependencies first for better layer caching.
COPY odesign-bundle/requirements.txt /tmp/odesign-requirements.txt
RUN conda run --no-capture-output -n odesign pip install --no-cache-dir \
    -r /tmp/odesign-requirements.txt \
    -f https://data.pyg.org/whl/torch-2.3.1+cu121.html \
    && rm -f /tmp/odesign-requirements.txt

# Bundle full ODesign assets (code + data + ckpt) into the image.
COPY odesign-bundle/ /workspace/odesign/
RUN test -f /workspace/odesign/scripts/inference.py \
    && test -f /workspace/odesign/data/components.v20240608.cif \
    && test -f /workspace/odesign/data/components.v20240608.cif.rdkit_mol.pkl \
    && test -f /workspace/odesign/ckpt/ckpt/odesign_base_prot_flex.pt \
    && test -f /workspace/odesign/ckpt/ckpt/odesign_base_prot_rigid.pt \
    && test -f /workspace/odesign/ckpt/ckpt/odesign_base_ligand_rigid.pt \
    && test -f /workspace/odesign/ckpt/ckpt/odesign_base_na_rigid.pt \
    && test -f /workspace/odesign/ckpt/ckpt/oinvfold_protein.ckpt \
    && test -f /workspace/odesign/ckpt/ckpt/oinvfold_ligand.ckpt \
    && test -f /workspace/odesign/ckpt/ckpt/oinvfold_dna.ckpt \
    && test -f /workspace/odesign/ckpt/ckpt/oinvfold_rna.ckpt

RUN git clone -b v3.5.1 https://github.com/NVIDIA/cutlass.git "${CUTLASS_PATH}"
RUN printf '#!/bin/bash\nset -e\nsource /opt/conda/etc/profile.d/conda.sh\nexec conda run --no-capture-output -n odesign python "$@"\n' > /usr/local/bin/odesign-python \
    && chmod +x /usr/local/bin/odesign-python

# Install PyMOL (headless) via apt
RUN apt-get update && apt-get install -y \
    pymol \
    && rm -rf /var/lib/apt/lists/*

# Set Chromium path for agent-browser
ENV AGENT_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# Install agent-browser and claude-code globally
RUN npm install -g agent-browser @anthropic-ai/claude-code

# Create app directory
WORKDIR /app

# Copy package files first for better caching
COPY agent-runner/package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY agent-runner/ ./

# Build TypeScript
RUN npm run build

# Create workspace directories
RUN mkdir -p /workspace/group /workspace/global /workspace/extra /workspace/ipc/messages /workspace/ipc/tasks /workspace/ipc/input /workspace/ipc/files

# Create entrypoint script
# Secrets are passed via stdin JSON — temp file is deleted immediately after Node reads it
# Follow-up messages arrive via IPC files in /workspace/ipc/input/
RUN printf '#!/bin/bash\nset -e\ncd /app && npx tsc --outDir /tmp/dist 2>&1 >&2\nln -s /app/node_modules /tmp/dist/node_modules\nchmod -R a-w /tmp/dist\ncat > /tmp/input.json\nnode /tmp/dist/index.js < /tmp/input.json\n' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

# Set ownership to node user (non-root) for writable directories
RUN chown -R node:node /workspace

# Switch to non-root user (required for --dangerously-skip-permissions)
USER node

# Set working directory to group workspace
WORKDIR /workspace/group

# Entry point reads JSON from stdin, outputs JSON to stdout
ENTRYPOINT ["/app/entrypoint.sh"]
