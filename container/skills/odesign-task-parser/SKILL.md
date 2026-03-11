---
name: odesign-task-parser
description: Parse a natural-language ODesign protein design request into a structured task spec and materialize ready-to-use `odesign_input.json` plus a parameterized `inference_demo.sh`. Use when the user describes a protein design task and you need real files, not only prose.
---

# ODesign Task Parser

Use this skill to turn a user prompt into two concrete files:

- `odesign_input.json`
- `inference_demo.sh`

This skill stops after file generation. It does not run inference.

For concrete prompt patterns, read `references/prompt_patterns.md`.

## Internal Task Spec

First parse the prompt into this internal top-level shape:

```json
{
  "infer_model_name": "odesign_base_prot_flex",
  "design_modality": "protein",
  "odesign_input": [
    {
      "name": "",
      "ref_file": "",
      "motif_scaffolding": false,
      "center_method": "",
      "hotspot": "",
      "condition_atom": {},
      "chains": []
    }
  ]
}
```

Rules:

- `odesign_input` must always be an array.
- Every sample object must contain all top-level keys shown above.
- Keep missing string fields as `""`, missing maps as `{}`, and missing lists as `[]`.
- Do not invent residue ranges, chain IDs, file paths, hotspot residues, or atom names.
- Preserve user-provided paths exactly as written.

## File Materialization

After building the internal task spec:

1. Choose a writable run directory under `/workspace/group/odesign_runs/<run_name>/`.
2. Save the internal task spec to `task_spec.json` in that directory.
3. Materialize the final files with:

```bash
python3 ~/.claude/skills/odesign-task-parser/scripts/write_odesign_files.py \
  --spec /workspace/group/odesign_runs/<run_name>/task_spec.json \
  --out-dir /workspace/group/odesign_runs/<run_name>
```

This writes:

- `/workspace/group/odesign_runs/<run_name>/odesign_input.json`
- `/workspace/group/odesign_runs/<run_name>/inference_demo.sh`

## Stable ODesign Path Contract

Use the same in-container ODesign root every time:

- `ODESIGN_REPO_DIR=/workspace/odesign`

Fill the following `inference_demo.sh` parameters exactly like this:

- `infer_model_name`: infer from the task rules below.
- `design_modality`: infer from the task rules below.
- `input_json_path`: absolute path to the generated `odesign_input.json`.
- `data_root_dir="${ODESIGN_REPO_DIR:-/workspace/odesign}/data"`
- `ckpt_root_dir="${ODESIGN_REPO_DIR:-/workspace/odesign}/ckpt"`
- `exp_name=""`
- `use_msa=true` only when at least one chain has a non-empty `msa` block; otherwise `false`.
- Replace `export CUDA_VISIBLE_DEVICES=0` with an auto-detect block that picks the currently lightest GPU via `nvidia-smi`, then falls back to `0` when detection is unavailable.
- Add a shell safety preamble so the generated script exits non-zero when ODesign inference fails.

Do not change any other `inference_demo.sh` parameters or command lines in this skill. Copy the template content as-is except for the listed field replacements and the shell safety preamble.

## Field Mapping

### `name`

- Use the user-supplied sample name if present.
- Otherwise, generate the name based on the prompt.

### `ref_file`

- Use the PDB/CIF path from the prompt if present.
- If the prompt does not provide a structure file, return `""`.

### `motif_scaffolding`

- Set to `true` only when the prompt explicitly requests motif scaffolding or preserving a fixed motif while designing surrounding protein structure.
- Otherwise set to `false`.

### `center_method`

- Use `"hotspot_center"` when the binding location is explicitly known and the hotspot or condition_atom fields are provided in the JSON. This uses the geometric center of the specified interacting atoms or residues and is the most recommended and commonly used method.

- Use `"global_center"` when there is no specific local binding pocket or when performing global feature generation. This uses the geometric center of the entire molecular system, including all provided reference chains and structures.

- Use `"user_provide_center"` when the generated molecule must be strictly constrained to a specific 3D coordinate point. This requires specific coordinate information to be passed in the JSON.

- Use `""` as the default fallback when no center_method is designated. This defaults to standard model alignment strategies and is typically used for tasks without obvious hotspot constraints, such as the de novo generation of a completely new chain.

### `hotspot`

- Use ODesign-style residue or atom anchors such as `B/129,B/130` or `A/1,Z/1`.
- Normalize separator formatting to comma-separated values without extra spaces.
- If the prompt does not specify hotspots, return `""`.

### `condition_atom`

- Use this only when the prompt specifies exact atoms that must be preserved or scaffolded.
- Format as:

```json
{
  "A/1": ["NE2", "CD2", "CE1"]
}
```

- Otherwise use `{}`.

### `chains`

Each chain object must include:

- `chain_type`
- `sequence`

Optional chain keys:

- `length`
- `msa`

Chain rules:

- `chain_type`: Use `proteinChain` for protein target chains and designed protein chains, `ligand` for reference ligands or small molecules, `rnaChain` for RNA, and `dnaChain` for DNA.

- `sequence`: This field defines the fragments of the chain and can be segmented by commas (,) for mixed chains. You must strictly follow these symbol rules to define the nature of each segment
  - Fragments containing `/` (Condition / Known Structure): Represents a conditional component extracted from the `ref_file`. Format: ChainID/Start-End (e.g., "B/65-257" extracts residues 65 to 257 from chain B).
  - Fragments without `/` (De Novo Design / To Be Generated): Represents a design component. The `-` symbol separates the lower and upper bounds of the design length range. Format: MinLength-MaxLength (e.g., "65-65" generates a fixed length of 65; "1-70" generates a length between 1 and 70).
  - Example of a mixed sequence for scaffolding: "1-80,A/1-11,25-35" .

- `length`: Use only to specify the total length of the chain to control the overall length of the design component, which is especially important when combining multiple explicit motif segments.

- `msa`: Use only when the prompt explicitly provides a precomputed MSA directory or pairing database.

MSA format:

```json
{
  "precomputed_msa_dir": "/path/to/msa_dir",
  "pairing_db": "uniref100"
}
```

## Model Inference Rules

- For protein-generation tasks:
  - `design_modality = "protein"`
  - Default to `infer_model_name = "odesign_base_prot_flex"`.
  - Only switch to `infer_model_name = "odesign_base_prot_rigid"` if the user explicitly requests rigid-receptor design or explicitly names that model.
- For ligand-generation tasks:
  - `design_modality = "ligand"`
  - `infer_model_name = "odesign_base_ligand_rigid"`.
- For nucleic acid-generation tasks:
  - `design_modality = "dna"` or `"rna"`
  - `infer_model_name = "odesign_base_na_rigid"`.

## Validation

When Bash is available and the parsed JSON needs to be trusted downstream, validate it with:

```bash
python3 ~/.claude/skills/odesign-task-parser/scripts/validate_odesign_task.py parsed_task.json
```

The validator accepts either a file path or stdin:

```bash
printf '%s' "$PARSED_JSON" | python3 ~/.claude/skills/odesign-task-parser/scripts/validate_odesign_task.py
```

## Final Response Behavior

- Create the two files first.
- Return the file paths and the resolved parameter summary.
- Only print the raw internal JSON task spec if the user explicitly asks to see it.
