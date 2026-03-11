#!/usr/bin/env python3
import argparse
import json
import re
import shutil
import sys
from pathlib import Path
from typing import Any


def fail(message: str) -> None:
    print(f"Preparation failed: {message}", file=sys.stderr)
    raise SystemExit(1)


def ensure(condition: bool, message: str) -> None:
    if not condition:
        fail(message)


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        fail(f"missing JSON file: {path}")
    except json.JSONDecodeError as exc:
        fail(f"invalid JSON in {path}: {exc}")
    raise AssertionError("unreachable")


def infer_design_modality(infer_model_name: str, design_modality: str) -> str:
    if design_modality:
        return design_modality
    if "prot" in infer_model_name:
        return "protein"
    if "ligand" in infer_model_name:
        return "ligand"
    if "na" in infer_model_name:
        fail("nucleic-acid models require design_modality to be explicitly set")
    return ""


def resolve_use_msa(spec: dict[str, Any], use_msa_arg: str) -> bool:
    if use_msa_arg == "true":
        return True
    if use_msa_arg == "false":
        return False
    for sample in spec.get("odesign_input", []):
        for chain in sample.get("chains", []):
            if "msa" in chain:
                return True
    return False


def sanitize_exp_name(raw_name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", raw_name.strip())
    return cleaned.strip("._")[:80] or "odesign_inference"


def derive_exp_name(spec: dict[str, Any], infer_model_name: str, explicit_name: str | None) -> str:
    if explicit_name:
        return sanitize_exp_name(explicit_name)
    for sample in spec.get("odesign_input", []):
        name = sample.get("name", "")
        if isinstance(name, str) and name.strip():
            return sanitize_exp_name(name)
    return sanitize_exp_name(f"infer_{infer_model_name}")


def ensure_parser_contract(spec: dict[str, Any]) -> None:
    expected_keys = {"infer_model_name", "design_modality", "odesign_input"}
    ensure(set(spec) == expected_keys, "task spec must contain infer_model_name, design_modality, and odesign_input")
    ensure(isinstance(spec["infer_model_name"], str), "infer_model_name must be a string")
    ensure(isinstance(spec["design_modality"], str), "design_modality must be a string")
    ensure(isinstance(spec["odesign_input"], list), "odesign_input must be a list")
    ensure(spec["infer_model_name"].strip() != "", "infer_model_name must not be empty")
    ensure(len(spec["odesign_input"]) > 0, "odesign_input must contain at least one sample")


def normalize_seed_string(raw_value: str) -> str:
    try:
        parsed = json.loads(raw_value)
    except json.JSONDecodeError as exc:
        fail(f"seeds must be valid JSON, got {raw_value!r}: {exc}")

    ensure(isinstance(parsed, list) and parsed, "seeds must be a non-empty JSON list")
    for index, seed in enumerate(parsed):
        ensure(isinstance(seed, int), f"seed at index {index} must be an integer")
    return json.dumps(parsed)


def ensure_runtime_prereqs(
    odesign_repo: Path,
    data_root_dir: Path,
    ckpt_root_dir: Path,
    infer_model_name: str,
    use_msa: bool,
    spec: dict[str, Any],
) -> None:
    ensure(odesign_repo.is_dir(), f"ODesign repo is missing: {odesign_repo}")
    ensure((odesign_repo / "inference_demo.sh").is_file(), f"missing {odesign_repo / 'inference_demo.sh'}")
    ensure((odesign_repo / "scripts" / "inference.py").is_file(), f"missing {odesign_repo / 'scripts' / 'inference.py'}")
    ensure(shutil.which("odesign-python") is not None, "odesign-python is not installed in the container")
    ensure(data_root_dir.is_dir(), f"data_root_dir does not exist: {data_root_dir}")
    ensure(ckpt_root_dir.is_dir(), f"ckpt_root_dir does not exist: {ckpt_root_dir}")
    ensure(
        (data_root_dir / "components.v20240608.cif").is_file(),
        f"missing {data_root_dir / 'components.v20240608.cif'}",
    )
    ensure(
        (data_root_dir / "components.v20240608.cif.rdkit_mol.pkl").is_file(),
        f"missing {data_root_dir / 'components.v20240608.cif.rdkit_mol.pkl'}",
    )
    ensure(
        (ckpt_root_dir / f"{infer_model_name}.pt").is_file(),
        f"missing checkpoint {ckpt_root_dir / f'{infer_model_name}.pt'}",
    )

    if use_msa:
        for sample in spec["odesign_input"]:
            for chain in sample.get("chains", []):
                msa = chain.get("msa")
                if msa and isinstance(msa, dict) and "precomputed_msa_dir" in msa:
                    msa_dir = Path(msa["precomputed_msa_dir"])
                    ensure(msa_dir.is_dir(), f"missing MSA directory: {msa_dir}")


def replace_line(content: str, pattern: str, replacement: str) -> str:
    updated, count = re.subn(
        pattern,
        lambda _match: replacement,
        content,
        count=1,
        flags=re.MULTILINE,
    )
    ensure(count == 1, f"could not find line matching /{pattern}/ in inference_demo.sh")
    return updated


def build_inference_demo(
    template: str,
    odesign_repo: Path,
    infer_model_name: str,
    design_modality: str,
    data_root_dir: Path,
    ckpt_root_dir: Path,
    input_json_path: Path,
    exp_name: str,
    seeds: str,
    n_sample: int,
    use_msa: bool,
    num_workers: int,
    cuda_visible_devices: str,
) -> str:
    content = template
    content = replace_line(content, r'^infer_model_name=.*$', f'infer_model_name="{infer_model_name}"')
    content = replace_line(content, r'^design_modality=.*$', f'design_modality="{design_modality}"')
    content = replace_line(content, r'^data_root_dir=.*$', f'data_root_dir="{data_root_dir}"')
    content = replace_line(content, r'^ckpt_root_dir=.*$', f'ckpt_root_dir="{ckpt_root_dir}"')
    content = replace_line(content, r'^input_json_path=.*$', f'input_json_path="{input_json_path}"')
    content = replace_line(content, r'^exp_name=.*$', f'exp_name="{exp_name}"')
    content = replace_line(content, r'^seeds=.*$', f"seeds='{seeds}'")
    content = replace_line(content, r'^N_sample=.*$', f'N_sample={n_sample}')
    content = replace_line(content, r'^use_msa=.*$', f'use_msa={"true" if use_msa else "false"}')
    content = replace_line(content, r'^num_workers=.*$', f'num_workers={num_workers}')
    content = replace_line(
        content,
        r'^export CUDA_VISIBLE_DEVICES=.*$',
        f'export CUDA_VISIBLE_DEVICES="{cuda_visible_devices}"',
    )
    content = replace_line(
        content,
        r'^\s*python \./scripts/inference\.py \\$',
        f'odesign-python {odesign_repo / "scripts" / "inference.py"} \\',
    )
    return content


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Prepare a writable ODesign inference workspace from a parsed task spec.",
    )
    parser.add_argument("--spec", required=True, help="Path to the parsed task-spec JSON file.")
    parser.add_argument("--run-dir", required=True, help="Writable run directory.")
    parser.add_argument("--odesign-repo", default="/workspace/odesign", help="Mounted ODesign repo path.")
    parser.add_argument("--data-root", help="Override data_root_dir. Defaults to <odesign-repo>/data.")
    parser.add_argument("--ckpt-root", help="Override ckpt_root_dir. Defaults to <odesign-repo>/ckpt.")
    parser.add_argument("--exp-name", help="Override exp_name.")
    parser.add_argument("--seeds", default="[42]", help='Seed list string, for example "[42]" or "[42, 101]".')
    parser.add_argument("--n-sample", type=int, default=5, help="Number of samples per seed.")
    parser.add_argument("--num-workers", type=int, default=4, help="Number of dataloader workers.")
    parser.add_argument("--cuda-visible-devices", default="0", help="CUDA_VISIBLE_DEVICES value.")
    parser.add_argument(
        "--use-msa",
        choices=("auto", "true", "false"),
        default="auto",
        help="Force or auto-detect use_msa.",
    )
    args = parser.parse_args()

    spec_path = Path(args.spec).expanduser()
    run_dir = Path(args.run_dir).expanduser()
    odesign_repo = Path(args.odesign_repo).expanduser()

    spec = load_json(spec_path)
    ensure(isinstance(spec, dict), "task spec must be a JSON object")
    ensure_parser_contract(spec)

    infer_model_name = spec["infer_model_name"]
    design_modality = infer_design_modality(infer_model_name, spec["design_modality"])
    use_msa = resolve_use_msa(spec, args.use_msa)
    exp_name = derive_exp_name(spec, infer_model_name, args.exp_name)
    seeds = normalize_seed_string(args.seeds)
    data_root_dir = Path(args.data_root).expanduser() if args.data_root else odesign_repo / "data"
    ckpt_root_dir = Path(args.ckpt_root).expanduser() if args.ckpt_root else odesign_repo / "ckpt"

    ensure_runtime_prereqs(
        odesign_repo=odesign_repo,
        data_root_dir=data_root_dir,
        ckpt_root_dir=ckpt_root_dir,
        infer_model_name=infer_model_name,
        use_msa=use_msa,
        spec=spec,
    )

    run_dir.mkdir(parents=True, exist_ok=True)
    input_json_path = run_dir / "odesign_input.json"
    input_json_path.write_text(
        json.dumps(spec["odesign_input"], indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )

    template = (odesign_repo / "inference_demo.sh").read_text(encoding="utf-8")
    script_content = build_inference_demo(
        template=template,
        odesign_repo=odesign_repo.resolve(),
        infer_model_name=infer_model_name,
        design_modality=design_modality,
        data_root_dir=data_root_dir.resolve(),
        ckpt_root_dir=ckpt_root_dir.resolve(),
        input_json_path=input_json_path.resolve(),
        exp_name=exp_name,
        seeds=seeds,
        n_sample=args.n_sample,
        use_msa=use_msa,
        num_workers=args.num_workers,
        cuda_visible_devices=args.cuda_visible_devices,
    )

    script_path = run_dir / "inference_demo.sh"
    script_path.write_text(script_content, encoding="utf-8")
    script_path.chmod(0o755)

    summary = {
        "run_dir": str(run_dir.resolve()),
        "task_spec_path": str(spec_path.resolve()),
        "input_json_path": str(input_json_path.resolve()),
        "script_path": str(script_path.resolve()),
        "infer_model_name": infer_model_name,
        "design_modality": design_modality,
        "exp_name": exp_name,
        "use_msa": use_msa,
        "command": f"cd {run_dir.resolve()} && bash ./inference_demo.sh",
    }
    print(json.dumps(summary, indent=2, ensure_ascii=True))


if __name__ == "__main__":
    main()
