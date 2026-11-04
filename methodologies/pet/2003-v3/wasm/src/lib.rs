use serde_json::{json, Value};

fn compute_methodology(input: &Value) -> Result<Value, ()> {
    let count = input.get("petBottleCount").and_then(Value::as_u64).ok_or(())?;
    if count == 0 || count > 100_000 { return Err(()) }
    Ok(json!({ "estimated_co2e": { "value": (count * 20).to_string(), "unit": "gCO2e", "scale": 0 } }))
}

dmrvn_json_wasm_runtime::export_json_wasm_v2!(compute_methodology);
