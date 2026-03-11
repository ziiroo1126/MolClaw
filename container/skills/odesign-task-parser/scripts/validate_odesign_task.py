#!/usr/bin/env python3
import argparse
import json
import sys
from typing import Any

VALID_MODELS = {
    "",
    "odesign_base_prot_flex",
    "odesign_base_prot_rigid",
    "odesign_base_ligand_rigid",
    "odesign_base_na_rigid",
}
VALID_MODALITIES = {"", "protein", "ligand", "dna", "rna"}
VALID_SAMPLE_KEYS = {
    "name",
    "ref_file",
    "motif_scaffolding",
    "center_method",
    "hotspot",
    "condition_atom",
    "chains",
    "partial_diff",
}
VALID_CHAIN_KEYS = {
    "chain_type",
    "sequence",
    "length",
    "msa",
    "if_cyc",
    "smiles",
}
VALID_CHAIN_TYPES = {"proteinChain", "ligand", "rnaChain", "dnaChain"}
VALID_MSA_KEYS = {"precomputed_msa_dir", "pairing_db"}


def fail(message: str) -> None:
    print(f"Validation failed: {message}", file=sys.stderr)
    raise SystemExit(1)


def ensure(condition: bool, message: str) -> None:
    if not condition:
        fail(message)


def read_payload(path: str | None) -> Any:
    raw = sys.stdin.read() if path is None else open(path, "r", encoding="utf-8").read()
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        fail(f"invalid JSON: {exc}")
    raise AssertionError("unreachable")


def validate_condition_atom(value: Any, sample_index: int) -> None:
    ensure(isinstance(value, dict), f"sample {sample_index}: condition_atom must be an object")
    for residue_id, atoms in value.items():
        ensure(
            isinstance(residue_id, str) and residue_id,
            f"sample {sample_index}: condition_atom keys must be non-empty strings",
        )
        ensure(
            isinstance(atoms, list),
            f"sample {sample_index}: condition_atom[{residue_id}] must be a list",
        )
        for atom_name in atoms:
            ensure(
                isinstance(atom_name, str) and atom_name,
                f"sample {sample_index}: atom names must be non-empty strings",
            )


def validate_msa(value: Any, sample_index: int, chain_index: int) -> None:
    ensure(isinstance(value, dict), f"sample {sample_index} chain {chain_index}: msa must be an object")
    extra_keys = set(value) - VALID_MSA_KEYS
    ensure(
        not extra_keys,
        f"sample {sample_index} chain {chain_index}: unsupported msa keys {sorted(extra_keys)}",
    )
    for key in VALID_MSA_KEYS:
        if key in value:
            ensure(
                isinstance(value[key], str),
                f"sample {sample_index} chain {chain_index}: msa.{key} must be a string",
            )


def validate_chain(chain: Any, sample_index: int, chain_index: int) -> None:
    ensure(isinstance(chain, dict), f"sample {sample_index} chain {chain_index}: chain must be an object")
    extra_keys = set(chain) - VALID_CHAIN_KEYS
    ensure(
        not extra_keys,
        f"sample {sample_index} chain {chain_index}: unsupported chain keys {sorted(extra_keys)}",
    )
    ensure("chain_type" in chain, f"sample {sample_index} chain {chain_index}: missing chain_type")
    ensure(
        isinstance(chain["chain_type"], str) and chain["chain_type"] in VALID_CHAIN_TYPES,
        f"sample {sample_index} chain {chain_index}: invalid chain_type",
    )
    ensure(
        "sequence" in chain or "smiles" in chain,
        f"sample {sample_index} chain {chain_index}: missing sequence or smiles",
    )
    if "sequence" in chain:
        ensure(
            isinstance(chain["sequence"], str),
            f"sample {sample_index} chain {chain_index}: sequence must be a string",
        )
    if "smiles" in chain:
        ensure(
            isinstance(chain["smiles"], str),
            f"sample {sample_index} chain {chain_index}: smiles must be a string",
        )
    if "length" in chain:
        ensure(
            isinstance(chain["length"], int),
            f"sample {sample_index} chain {chain_index}: length must be an integer",
        )
    if "if_cyc" in chain:
        ensure(
            isinstance(chain["if_cyc"], (str, bool)),
            f"sample {sample_index} chain {chain_index}: if_cyc must be a string or boolean",
        )
    if "msa" in chain:
        validate_msa(chain["msa"], sample_index, chain_index)


def validate_sample(sample: Any, sample_index: int) -> None:
    ensure(isinstance(sample, dict), f"sample {sample_index}: sample must be an object")
    extra_keys = set(sample) - VALID_SAMPLE_KEYS
    ensure(
        not extra_keys,
        f"sample {sample_index}: unsupported sample keys {sorted(extra_keys)}",
    )

    for key in (
        "name",
        "ref_file",
        "motif_scaffolding",
        "center_method",
        "hotspot",
        "condition_atom",
        "chains",
    ):
        ensure(key in sample, f"sample {sample_index}: missing {key}")

    ensure(isinstance(sample["name"], str), f"sample {sample_index}: name must be a string")
    ensure(isinstance(sample["ref_file"], str), f"sample {sample_index}: ref_file must be a string")
    ensure(
        isinstance(sample["motif_scaffolding"], bool),
        f"sample {sample_index}: motif_scaffolding must be a boolean",
    )
    ensure(
        isinstance(sample["center_method"], str),
        f"sample {sample_index}: center_method must be a string",
    )
    ensure(isinstance(sample["hotspot"], str), f"sample {sample_index}: hotspot must be a string")
    validate_condition_atom(sample["condition_atom"], sample_index)
    ensure(isinstance(sample["chains"], list), f"sample {sample_index}: chains must be a list")
    for chain_index, chain in enumerate(sample["chains"]):
        validate_chain(chain, sample_index, chain_index)
    if "partial_diff" in sample:
        ensure(
            isinstance(sample["partial_diff"], str),
            f"sample {sample_index}: partial_diff must be a string",
        )


def validate_payload(payload: Any) -> None:
    ensure(isinstance(payload, dict), "top-level payload must be an object")
    ensure(
        set(payload) == {"infer_model_name", "design_modality", "odesign_input"},
        "top-level keys must be exactly infer_model_name, design_modality, odesign_input",
    )

    infer_model_name = payload["infer_model_name"]
    design_modality = payload["design_modality"]
    odesign_input = payload["odesign_input"]

    ensure(
        isinstance(infer_model_name, str) and infer_model_name in VALID_MODELS,
        "infer_model_name is invalid",
    )
    ensure(
        isinstance(design_modality, str) and design_modality in VALID_MODALITIES,
        "design_modality is invalid",
    )
    ensure(isinstance(odesign_input, list), "odesign_input must be a list")

    if infer_model_name in {"odesign_base_prot_flex", "odesign_base_prot_rigid"}:
        ensure(
            design_modality in {"", "protein"},
            "protein models require design_modality to be empty or protein",
        )

    for sample_index, sample in enumerate(odesign_input):
        validate_sample(sample, sample_index)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Validate the structured JSON emitted by the ODesign task parser skill.",
    )
    parser.add_argument(
        "json_path",
        nargs="?",
        help="Optional JSON file path. If omitted, the validator reads JSON from stdin.",
    )
    args = parser.parse_args()

    payload = read_payload(args.json_path)
    validate_payload(payload)
    print("Validation passed.")


if __name__ == "__main__":
    main()
