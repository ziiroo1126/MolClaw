---
name: odesign-inference
description: Run ODesign protein-design inference from a parsed task spec or prepared ODesign input JSON. Use when the user wants to execute ODesign, prepare `inference_demo.sh`, or generate design outputs rather than only parse the prompt.
---

# ODesign Inference

Use this skill to run ODesign inside MolClaw after task parsing is complete.

Do not edit `/workspace/odesign` in place. Treat it as a read-only mounted repo and stage each run under `/workspace/group/odesign_runs/...`.

## Runtime Requirements

Before running inference, verify all of the following:

- `/workspace/odesign/inference_demo.sh` exists.
- `/workspace/odesign/scripts/inference.py` exists.
- `odesign-python` is available in `PATH`.
- The required ODesign data files exist under the chosen `data_root_dir`:
  - `components.v20240608.cif`
  - `components.v20240608.cif.rdkit_mol.pkl`
- The checkpoint `${infer_model_name}.pt` exists under the chosen `ckpt_root_dir`.

Default paths:

- `odesign_repo = /workspace/odesign`
- `data_root_dir = /workspace/odesign/data`
- `ckpt_root_dir = /workspace/odesign/ckpt`

## Preferred Workflow

1. Save the parsed task payload to a JSON file in the run directory.
2. Validate it with the task-parser validator when possible.
3. Prepare a writable run workspace with:

```bash
python3 ~/.claude/skills/odesign-inference/scripts/prepare_odesign_inference.py \
  --spec /workspace/group/odesign_runs/<run_name>/task_spec.json \
  --run-dir /workspace/group/odesign_runs/<run_name>
```

4. This creates:
   - `odesign_input.json`
   - a run-local `inference_demo.sh`
5. Run the prepared script from the run directory:

```bash
cd /workspace/group/odesign_runs/<run_name>
bash ./inference_demo.sh
```

## Behavior Rules

- Keep all user-editable artifacts in the run directory.
- Preserve the parsed `infer_model_name`, `design_modality`, and `odesign_input`.
- Auto-enable `use_msa=true` only when at least one chain contains an `msa` block.
- Prefer the first non-empty sample `name` as `exp_name`; otherwise fall back to `infer_<infer_model_name>`.
- Do not claim success unless you inspect the output directory and confirm at least one generated artifact such as:
  - `run.log`
  - `traceback.pkl`
  - a `.cif` file under `predictions/`

## Final Response Behavior

- Report the run directory and output directory.
- If prerequisites are missing, say exactly which paths or files are absent.
- If the run fails, summarize the concrete error from `run.log` or stderr.
