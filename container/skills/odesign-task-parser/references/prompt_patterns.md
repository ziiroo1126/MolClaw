# Prompt Patterns

Use these patterns to map natural-language requests into ODesign task JSON.

## 1. Protein-binding protein

Prompt pattern:

```text
Design a protein binder against chain B residues 129 and 130 using /workspace/group/IL7Ra_complex.pdb. Keep chain B/65-257 fixed and generate a 64-residue binder.
```

Expected structure:

```json
{
  "infer_model_name": "odesign_base_prot_flex",
  "design_modality": "protein",
  "odesign_input": [
    {
      "name": "",
      "ref_file": "/workspace/group/IL7Ra_complex.pdb",
      "motif_scaffolding": false,
      "center_method": "hotspot_center",
      "hotspot": "B/129,B/130",
      "condition_atom": {},
      "chains": [
        {
          "chain_type": "proteinChain",
          "sequence": "B/65-257"
        },
        {
          "chain_type": "proteinChain",
          "sequence": "64-64"
        }
      ]
    }
  ]
}
```

## 2. Motif scaffolding

Prompt pattern:

```text
Use /workspace/group/motif.pdb to scaffold motif A/1-11 and residues 25-35 into a 175 aa protein.
```

Expected structure:

```json
{
  "infer_model_name": "odesign_base_prot_flex",
  "design_modality": "protein",
  "odesign_input": [
    {
      "name": "",
      "ref_file": "/workspace/group/motif.pdb",
      "motif_scaffolding": true,
      "center_method": "",
      "hotspot": "",
      "condition_atom": {},
      "chains": [
        {
          "chain_type": "proteinChain",
          "sequence": "A/1-11,25-35",
          "length": 175
        }
      ]
    }
  ]
}
```

## 3. Atom scaffold

Prompt pattern:

```text
Scaffold atoms NE2/CD2/CE1 from residue A/1 in /workspace/group/template.pdb and center the design around hotspot A/1.
```

Expected structure:

```json
{
  "infer_model_name": "odesign_base_prot_flex",
  "design_modality": "protein",
  "odesign_input": [
    {
      "name": "",
      "ref_file": "/workspace/group/template.pdb",
      "motif_scaffolding": false,
      "center_method": "hotspot_center",
      "hotspot": "A/1",
      "condition_atom": {
        "A/1": ["NE2", "CD2", "CE1"]
      },
      "chains": []
    }
  ]
}
```

## 4. Protein generation with MSA

Prompt pattern:

```text
Design a protein around target chain B/65-257 using hotspots B/129 and B/130. Use precomputed MSA from /workspace/group/msa/ paired with uniref100.
```

Expected structure:

```json
{
  "infer_model_name": "odesign_base_prot_flex",
  "design_modality": "protein",
  "odesign_input": [
    {
      "name": "",
      "ref_file": "",
      "motif_scaffolding": false,
      "center_method": "hotspot_center",
      "hotspot": "B/129,B/130",
      "condition_atom": {},
      "chains": [
        {
          "chain_type": "proteinChain",
          "sequence": "B/65-257",
          "msa": {
            "precomputed_msa_dir": "/workspace/group/msa/",
            "pairing_db": "uniref100"
          }
        }
      ]
    }
  ]
}
```
