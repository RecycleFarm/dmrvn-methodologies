# DMRVN WASM Methodologies

DMRVN 노드가 내려받아 실행할 방법론 소스와 검증된 WASM 패키지입니다.

## WASM 사용

1. 아래 빌드 목록에서 필요한 ID/version의 `manifest.json`, `methodology.wasm`을 받습니다. 기기 검증 방법론만 `device-policy.json`도 받습니다.
2. 승인 Registry/Claim에 고정된 `methodologyHash`와 manifest를 비교하고, 모듈 bytes의 keccak256이 `wasmHash`와 같은지 확인합니다.
3. manifest의 input schema와 ABI에 따라 실행하고 output schema로 결과를 해석합니다.

기존 패키지는 legacy ABI를 유지합니다. 신규 범용 방법론은 `JSON_WASM_V2`를 사용하며 Rust 툴체인은 [`wasm/json-abi/rust-toolchain.toml`](wasm/json-abi/rust-toolchain.toml)에 고정합니다. 신규 ABI는 `memory`, `alloc(length)`, `compute(inputPointer, inputLength)`, `result_len()`, `dealloc(pointer, length)`를 export하고 imports를 허용하지 않습니다. 입력·출력은 UTF-8 JSON 객체이며 manifest의 JSON Schema 2020-12로 검사합니다. 이 실행기와 ABI는 기존 legacy 패키지를 변경하지 않습니다.

현재 ACTIVE Registry에서 방법론별 최신 버전만 표시합니다. 과거 버전 빌드와 패키지는 보관되며, 이미 생성된 Claim은 Claim에 고정된 버전과 hash를 계속 사용합니다. README 목록은 `readme-methodologies.json`의 Registry 확인 결과를 사용하며, 신규 버전의 활성화·비활성화 후 해당 파일을 함께 갱신해야 합니다.

현재 JSON ABI 패키지:

| 방법론 | JSON 입력 예 | JSON 출력 예 | 의미 |
|---|---|---|---|
| PET 2003/v3 | `{"petBottleCount":3}` | `{"estimated_co2e":{"value":"60","unit":"gCO2e","scale":0}}` | 통합 시험용 계수이며 실제 재활용이나 공식 감축량 증명이 아님 |
| 텀블러 2001/v6 | 검증된 총량 `{"waterIntakeMl":850}` | `{"avoided_pet_co2e":{"value":"20","unit":"gCO2e","scale":0}}` | 최신 ACTIVE Registry 버전. 기기 이벤트는 별도 Evidence 검증 입력 |
| 태양광 2004/v2 | 측정 배열, 배출계수, 프로젝트 배출량 | 기준선·프로젝트 배출량·순감축량 객체와 측정 건수 | JSON 입출력 통합 시험용이며 승인된 탄소 방법론이 아님 |

| 샘플 | 입력 | 검증 | 결과 |
|---|---|---|---|
| PET 1003 / 2003/v3 | `petBottleCount=3` (1..100000) | JSON Schema 입력 검증: 파트너 신고 입력 | `estimated_co2e=60 gCO2e` |
| 텀블러 1001 / 2001/v6 | 서명 기기 이벤트 (`items`), WASM 입력은 검증 합계 850 mL | 기기 서명·정책 검증 + JSON ABI v2 | `avoided_pet_co2e=20 gCO2e` |
| 태양광 1004 / 2004/v2 | 발전량 측정 2건과 시험용 배출값 | JSON Schema 입력 검증 + JSON ABI v2 | 기준선 `450.1125`, 순감축량 `440.1125` tCO2e 시험 객체 |

PET는 시험용 `count × 20`이며 공식 탄소크레딧 인증이나 실제 폐기·재활용을 증명하지 않습니다. 텀블러의 현재 최신 ACTIVE 버전은 검증된 500 mL당 20 gCO2e를 계산합니다. 이전 방법론 버전의 WASM·manifest·정책 파일은 이미 고정된 Claim을 처리할 수 있도록 보존하지만, 이 요약 및 자동 생성 카탈로그에는 방법론별 최신 ACTIVE 버전 하나만 표시합니다.

GitHub 빌드 성공만으로 Registry 승인을 뜻하지 않습니다. README 선택 목록은 Firestore `ACTIVE` Registry 확인에 맞춰 갱신해야 합니다. 새 요청은 활동의 기본 포인터를 따르며, 이미 만들어진 Claim은 **Claim에 고정된 버전·hash**를 사용합니다. 최신 ACTIVE 버전과 현재 기본 포인터는 서로 다를 수 있습니다.

## 검증된 빌드

<!-- builds:start -->
검증 시각: 2026-11-24T07:16:28.623Z (UTC)
소스 커밋: `ee72ffc5e42596fc7da1d670d9c32a5ff632758e` · Node v22.22.3
[기계 판독용 catalog.json](builds/catalog.json)

| 방법론 | 활동 | WASM | manifest | 정책 | 빌드 정보 |
|---|---|---|---|---|---|
| 2001/v6 | 1001 | [89574 bytes](builds/tumbler/2001-v6/methodology.wasm) | [JSON](builds/tumbler/2001-v6/manifest.json) | [JSON](builds/tumbler/2001-v6/device-policy.json) | [rustc rustc 1.85.1 (4eb161250 2025-03-15), 6 vectors](builds/tumbler/2001-v6/build-info.json) |
| 2003/v3 | 1003 | [89567 bytes](builds/pet/2003-v3/methodology.wasm) | [JSON](builds/pet/2003-v3/manifest.json) | Not required (declared inputs) | [rustc rustc 1.85.1 (4eb161250 2025-03-15), 2 vectors](builds/pet/2003-v3/build-info.json) |
| 2004/v2 | 1004 | [108213 bytes](builds/solar/2004-v2/methodology.wasm) | [JSON](builds/solar/2004-v2/manifest.json) | Not required (declared inputs) | [rustc rustc 1.85.1 (4eb161250 2025-03-15), 2 vectors](builds/solar/2004-v2/build-info.json) |

### 2001/v6

- wasmHash: `0xc74c5ed3dacd4fbed52fbc7e498e5fab710c88fad4161f19417b80c0cd306668`
- methodologyHash: `0xee566cecbf9217e1a28d93cd1286aead1cb4af859a21fdf53fec45cc96c6f3f1`

### 2003/v3

- wasmHash: `0xfd484faf619e37f5b790ef70a68d3da343fb43e984594951947a0bad2100703f`
- methodologyHash: `0x5765869e964ce2cbe1c2f71e2b6d1860e086c2962e814b965c7d92094cf5d138`

### 2004/v2

- wasmHash: `0x3d7ffea52cf385c08a77e24020d08af25562f6cc17766ced62144c7bec89e0de`
- methodologyHash: `0xf57bb8d8dfbba65c19ce66dce69de204dc8974fe72ec8f2e141f04e447b9020f`
<!-- builds:end -->

## 수정·검증

legacy ABI 방법론은 `methodologies/<분류>/<ID>-v<version>/`에 `definition.json`, `methodology.wat`, `vectors.json`을 둡니다. 신규 JSON ABI 방법론은 같은 디렉터리에 `definition.json`, `vectors.json`, `package-config.json`과 독립 `wasm/` Cargo crate를 둡니다. `package-config.json`은 `JSON_WASM_V2` 런타임과 crate 디렉터리를 지정하고, crate는 공용 ABI 매크로를 호출해 자기 계산 함수만 연결합니다. 새 방법론은 공용 Rust 런타임·빌더에 방법론 이름이나 계산 분기를 추가하지 않습니다. 새 입력·출력은 JSON Schema로 정의하고 Rust 계산 함수에서 JSON을 직접 파싱·생성합니다. 신규/폐기 버전이 Registry에서 활성 상태로 바뀌면 `readme-methodologies.json`을 함께 갱신합니다. 이전 Claim 실행에 필요한 기존 빌드 산출물은 삭제하지 않습니다.

```bash
npm run setup:wasm
npm ci --ignore-scripts
npm test
npm run verify:all
npm run verify:reproducible
```

`ai-workspace`에서 PET·태양광·텀블러를 서버리스/Attestor와 함께 검증할 때는 패키지를 다시 빌드한 뒤 `npm run sync:workspace-fixtures`를 실행합니다. 이 명령은 검증된 `manifest.json`, `methodology.wasm`, `vectors.json`을 복사하고, 기기 서명 정책이 있는 텀블러 패키지는 `device-policy.json`도 함께 복사합니다. 배포·Registry 등록은 하지 않습니다. CI나 리뷰 전에는 `npm run verify:workspace-fixtures`로 복사본의 바이트·버전 일치를 확인합니다. downstream 테스트는 Claim에 고정된 방법론 버전과 WASM hash가 정확히 일치하는지 검증합니다.

JSON ABI용 Rust 버전은 `rust-toolchain.toml`이 단일 기준입니다. `npm run setup:wasm`은 npm 패키지 설치 전에도 실행할 수 있으며, 해당 Rust 버전과 WASM 타깃만 준비합니다. 빌드는 PATH의 임의 Cargo 대신 pin된 Cargo/Rustc를 선택하며 lockfile을 강제합니다. 툴체인이나 WASM 타깃이 없거나 버전이 다르면 필요한 조치를 오류로 표시합니다. Cargo 의존성 캐시와 빌드 산출물은 기본적으로 저장소의 무시되는 경로에 둡니다. `CARGO_HOME`과 target 경로는 Rust 출력에서 고정 경로로 remap하며, 빌드기가 로컬 경로 누출을 검사합니다. 따라서 셸별 캐시·target 위치가 WASM bytes나 `wasmHash`에 영향을 주지 않아야 합니다. 의도적인 캐시 경로 변경은 `DMRVN_CARGO_HOME`, 격리 빌드 디렉터리는 `DMRVN_WASM_TARGET_DIR`로 지정할 수 있습니다.

`npm run verify:all`은 legacy ABI와 JSON ABI 패키지를 모두 빌드하고 검증합니다. `npm run build:json`과 `npm run verify:json`은 JSON ABI만 따로 빌드하거나 기존 산출물을 검사할 때 사용할 수 있습니다. GitHub Actions도 같은 pin과 WASM 타깃을 설치한 뒤 테스트, 전체 검증, 재현성 검증을 실행합니다. 기본 브랜치에서 성공하면 `builds/`와 이 목록을 자동 커밋합니다. PR은 검증만 합니다. `wasmHash`는 bytes의 keccak256, `methodologyHash`는 manifest의 정렬 JSON/JCS 허용 부분집합 keccak256입니다. 상세 검증 근거는 [VALIDATION.md](VALIDATION.md)를 참고합니다.
