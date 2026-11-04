use serde_json::{json, Value};

fn compute_methodology(input: &Value) -> Result<Value, ()> {
    let water_intake_ml = input.get("waterIntakeMl").and_then(Value::as_u64).ok_or(())?;
    if water_intake_ml == 0 || water_intake_ml > 1_000_000 { return Err(()) }
    let avoided_pet_co2e = (water_intake_ml / 500).checked_mul(20).ok_or(())?;
    Ok(json!({ "avoided_pet_co2e": {
        "value": avoided_pet_co2e.to_string(), "unit": "gCO2e", "scale": 0
    } }))
}

dmrvn_json_wasm_runtime::export_json_wasm_v2!(compute_methodology);
