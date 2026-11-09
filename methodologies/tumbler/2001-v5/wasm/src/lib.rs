use serde_json::{json, Value};

fn compute_methodology(input: &Value) -> Result<Value, ()> {
    let water_intake_ml = input.get("waterIntakeMl").and_then(Value::as_u64).ok_or(())?;
    if water_intake_ml == 0 || water_intake_ml > 1_000_000 { return Err(()) }
    let carbon_reduced_g = water_intake_ml / 10;
    Ok(json!({ "avoided_pet_co2e": {
        "value": carbon_reduced_g.to_string(), "unit": "gCO2e", "scale": 0
    } }))
}

dmrvn_json_wasm_runtime::export_json_wasm_v2!(compute_methodology);
