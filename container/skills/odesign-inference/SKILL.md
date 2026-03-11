---
name: odesign-inference
description: Run ODesign inference from an already prepared `odesign_input.json` and `inference_demo.sh`. Use when the task-parser skill has already materialized the run files and you need to execute ODesign to generate outputs.
---

# ODesign Inference

Use this skill only after the task-parser skill has already created:

- `/workspace/group/odesign_runs/<run_name>/odesign_input.json`
- `/workspace/group/odesign_runs/<run_name>/inference_demo.sh`

This skill does not regenerate either file. It only verifies prerequisites and runs the prepared script.

Do not edit `/workspace/odesign` in place. Treat it as a read-only mounted repo and execute each run from `/workspace/group/odesign_runs/...`.

## Runtime Requirements

Before running inference, verify all of the following:

- `/workspace/group/odesign_runs/<run_name>/odesign_input.json` exists.
- `/workspace/group/odesign_runs/<run_name>/inference_demo.sh` exists.
- `/opt/conda/envs/odesign` exists.

Default paths:

- `odesign_repo = /workspace/odesign`
- `data_root_dir = /workspace/odesign/data`
- `ckpt_root_dir = /workspace/odesign/ckpt`

## Preferred Workflow

1. Change into the prepared run directory.
2. Link the ODesign repo subdirectories expected by the stock script.
3. Activate the `odesign` conda environment.
4. Run the prepared script as-is:

```bash
cd /workspace/group/odesign_runs/<run_name>
ln -sfn /workspace/odesign/scripts ./scripts
ln -sfn /workspace/odesign/configs ./configs
ln -sfn /workspace/odesign/src ./src
source /opt/conda/etc/profile.d/conda.sh
conda activate odesign
bash ./inference_demo.sh
```

Because the parser writes `exp_name=""`, ODesign will use its own default output naming under `outputs/infer_<infer_model_name>/...` unless the upstream template changes.

## Behavior Rules

- Do not regenerate `odesign_input.json` or `inference_demo.sh` in this skill.
- Keep all user-editable artifacts in the run directory.
- Preserve the parser-generated script content exactly; only create the local symlinks needed for execution.
- Do not claim success unless you inspect the output directory and confirm at least one generated artifact such as:
  - `run.log`
  - `traceback.pkl`
  - a `.cif` file under `predictions/`

## Final Response Behavior

- Report the run directory and output directory.
- If prerequisites are missing, say exactly which paths or files are absent.
- If the run fails, summarize the concrete error from `run.log` or stderr.
