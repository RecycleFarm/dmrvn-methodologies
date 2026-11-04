use serde_json::{json, Value};

fn compute_methodology(input: &Value) -> Result<Value, ()> {
    let measurements = input.get("measurements").and_then(Value::as_array).ok_or(())?;
    if measurements.is_empty() || measurements.len() > 100 { return Err(()) }
    let mut generation_hundredths: u64 = 0;
    for measurement in measurements {
        let amount = measurement.get("generationMwh").and_then(Value::as_str).ok_or(())?;
        generation_hundredths = generation_hundredths.checked_add(parse_hundredths(amount)?).ok_or(())?;
    }
    let factor = input.get("emissionsFactorTco2ePerMwh").and_then(Value::as_str).ok_or(())?;
    let project = input.get("projectEmissionsTco2e").and_then(Value::as_str).ok_or(())?;
    let baseline_scale4 = generation_hundredths.checked_mul(parse_hundredths(factor)?).ok_or(())?;
    let project_scale4 = parse_whole_as_scale4(project)?;
    let net_scale4 = baseline_scale4.checked_sub(project_scale4).ok_or(())?;
    Ok(json!({
        "baselineEmissions": { "value": baseline_scale4.to_string(), "unit": "tCO2e", "scale": 4 },
        "projectEmissions": { "value": project_scale4.to_string(), "unit": "tCO2e", "scale": 4 },
        "netReduction": { "value": net_scale4.to_string(), "unit": "tCO2e", "scale": 4 },
        "measurementCount": measurements.len()
    }))
}

fn parse_hundredths(value: &str) -> Result<u64, ()> {
    let (whole, fraction) = value.split_once('.').ok_or(())?;
    if whole.is_empty() || fraction.len() != 2 || !whole.bytes().all(|b| b.is_ascii_digit())
        || !fraction.bytes().all(|b| b.is_ascii_digit()) { return Err(()) }
    let whole: u64 = whole.parse().map_err(|_| ())?;
    let fraction: u64 = fraction.parse().map_err(|_| ())?;
    whole.checked_mul(100).and_then(|v| v.checked_add(fraction)).ok_or(())
}

fn parse_whole_as_scale4(value: &str) -> Result<u64, ()> {
    if value.is_empty() || !value.bytes().all(|b| b.is_ascii_digit()) { return Err(()) }
    value.parse::<u64>().map_err(|_| ())?.checked_mul(10_000).ok_or(())
}

dmrvn_json_wasm_runtime::export_json_wasm_v2!(compute_methodology);
