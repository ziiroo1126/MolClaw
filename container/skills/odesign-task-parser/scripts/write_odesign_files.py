#!/usr/bin/env python3
import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

from validate_odesign_task import validate_payload


DEFAULT_ODESIGN_REPO_DIR = os.environ.get("ODESIGN_REPO_DIR", "/workspace/odesign")


def fail(message: str) -> None:
    print(f"Materialization failed: {message}", file=sys.stderr)
    raise SystemExit(1)


def ensure(condition: bool, message: str) -> None:
    if not condition:
        fail(message)


def load_spec(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        fail(f"missing task spec: {path}")
    except json.JSONDecodeError as exc:
        fail(f"invalid JSON in {path}: {exc}")

    ensure(isinstance(data, dict), "task spec must be a JSON object")
    validate_payload(data)
    return data


def infer_design_modality(infer_model_name: str, design_modality: str) -> str:
    if design_modality:
        return design_modality
    if "prot" in infer_model_name:
        return "protein"
    if "ligand" in infer_model_name:
        return "ligand"
    if "na" in infer_model_name:
        fail("nucleic-acid models require design_modality to be set explicitly")
    return ""


def has_non_empty_msa(payload: dict[str, Any]) -> bool:
    for sample in payload["odesign_input"]:
        for chain in sample.get("chains", []):
            msa = chain.get("msa")
            if isinstance(msa, dict) and msa:
                return True
    return False


def replace_once(content: str, pattern: str, replacement: str) -> str:
    updated, count = re.subn(
        pattern,
        lambda _match: replacement,
        content,
        count=1,
        flags=re.MULTILINE,
    )
    ensure(count == 1, f"could not find line matching /{pattern}/ in inference_demo.sh")
    return updated


def build_gpu_block() -> str:
    return """if command -v nvidia-smi >/dev/null 2>&1; then
    GPU_CANDIDATE="$(nvidia-smi --query-gpu=index,memory.used,utilization.gpu --format=csv,noheader,nounits | awk -F', *' 'BEGIN{best=\"0\"; best_mem=1e18; best_util=1e18} {mem=$2+0; util=$3+0; if (mem < best_mem || (mem == best_mem && util < best_util)) {best=$1; best_mem=mem; best_util=util}} END{print best}')"
    export CUDA_VISIBLE_DEVICES="${GPU_CANDIDATE:-0}"
else
    export CUDA_VISIBLE_DEVICES=0
fi"""


def render_inference_demo(
    template: str,
    infer_model_name: str,
    design_modality: str,
    input_json_path: Path,
    use_msa: bool,
) -> str:
    content = template
    content = replace_once(content, r'^infer_model_name=.*$', f'infer_model_name="{infer_model_name}"')
    content = replace_once(content, r'^design_modality=.*$', f'design_modality="{design_modality}"')
    content = replace_once(
        content,
        r'^data_root_dir=.*$',
        'data_root_dir="${ODESIGN_REPO_DIR:-/workspace/odesign}/data"',
    )
    content = replace_once(
        content,
        r'^ckpt_root_dir=.*$',
        'ckpt_root_dir="${ODESIGN_REPO_DIR:-/workspace/odesign}/ckpt"',
    )
    content = replace_once(content, r'^input_json_path=.*$', f'input_json_path="{input_json_path}"')
    content = replace_once(content, r'^exp_name=.*$', 'exp_name=""')
    content = replace_once(content, r'^use_msa=.*$', f'use_msa={"true" if use_msa else "false"}')
    content = replace_once(content, r'^export CUDA_VISIBLE_DEVICES=.*$', build_gpu_block())
    return content


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Write odesign_input.json and a parameterized inference_demo.sh from a parsed task spec.",
    )
    parser.add_argument("--spec", required=True, help="Path to the validated task-spec JSON.")
    parser.add_argument("--out-dir", required=True, help="Writable output directory for the generated files.")
    parser.add_argument(
        "--template",
        default=f"{DEFAULT_ODESIGN_REPO_DIR}/inference_demo.sh",
        help="Template inference_demo.sh path. Defaults to $ODESIGN_REPO_DIR/inference_demo.sh or /workspace/odesign/inference_demo.sh.",
    )
    args = parser.parse_args()

    spec_path = Path(args.spec).expanduser()
    out_dir = Path(args.out_dir).expanduser()
    template_path = Path(args.template).expanduser()

    payload = load_spec(spec_path)
    infer_model_name = payload["infer_model_name"]
    ensure(infer_model_name.strip() != "", "infer_model_name must not be empty")
    ensure(len(payload["odesign_input"]) > 0, "odesign_input must contain at least one sample")
    design_modality = infer_design_modality(infer_model_name, payload["design_modality"])
    use_msa = has_non_empty_msa(payload)

    ensure(template_path.is_file(), f"missing inference template: {template_path}")

    out_dir.mkdir(parents=True, exist_ok=True)
    input_json_path = (out_dir / "odesign_input.json").resolve()
    input_json_path.write_text(
        json.dumps(payload["odesign_input"], indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )

    template = template_path.read_text(encoding="utf-8")
    rendered_script = render_inference_demo(
        template=template,
        infer_model_name=infer_model_name,
        design_modality=design_modality,
        input_json_path=input_json_path,
        use_msa=use_msa,
    )

    script_path = (out_dir / "inference_demo.sh").resolve()
    script_path.write_text(rendered_script, encoding="utf-8")
    script_path.chmod(0o755)

    summary = {
        "task_spec_path": str(spec_path.resolve()),
        "input_json_path": str(input_json_path),
        "inference_demo_path": str(script_path),
        "infer_model_name": infer_model_name,
        "design_modality": design_modality,
        "data_root_dir": "${ODESIGN_REPO_DIR:-/workspace/odesign}/data",
        "ckpt_root_dir": "${ODESIGN_REPO_DIR:-/workspace/odesign}/ckpt",
        "exp_name": "",
        "use_msa": use_msa,
    }
    print(json.dumps(summary, indent=2, ensure_ascii=True))


if __name__ == "__main__":
    main()
