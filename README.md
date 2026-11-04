# DMRVN WASM Methodologies

DMRVN 노드가 내려받아 실행할 방법론 소스와 검증된 WASM 패키지입니다.

## WASM 사용

1. 아래 빌드 목록에서 필요한 ID/version의 `manifest.json`, `methodology.wasm`을 받습니다. 기기 검증 방법론만 `device-policy.json`도 받습니다.
2. 승인 Registry/Claim에 고정된 `methodologyHash`와 manifest를 비교하고, 모듈 bytes의 keccak256이 `wasmHash`와 같은지 확인합니다.
3. manifest의 input schema와 ABI에 따라 실행하고 output schema로 결과를 해석합니다.

기존 패키지는 legacy ABI를 유지합니다. 신규 범용 방법론은 `JSON_WASM_V2`를 사용하며 Rust 툴체인은 [`wasm/json-abi/rust-toolchain.toml`](wasm/json-abi/rust-toolchain.toml)에 고정합니다. 신규 ABI는 `memory`, `alloc(length)`, `compute(inputPointer, inputLength)`, `result_len()`, `dealloc(pointer, length)`를 export하고 imports를 허용하지 않습니다. 입력·출력은 UTF-8 JSON 객체이며 manifest의 JSON Schema 2020-12로 검사합니다. 이 실행기와 ABI는 기존 legacy 패키지를 변경하지 않습니다.

현재 JSON ABI 시험 패키지:

| 방법론 | JSON 입력 예 | JSON 출력 예 | 의미 |
|---|---|---|---|
| PET 2003/v3 | `{"petBottleCount":3}` | `{"estimated_co2e":{"value":"60","unit":"gCO2e","scale":0}}` | 통합 시험용 계수이며 실제 재활용이나 공식 감축량 증명이 아님 |
| 텀블러 2001/v4 | 서명 측정 합계의 `{"waterIntakeMl":850}` | `{"avoided_pet_co2e":{"value":"20","unit":"gCO2e","scale":0}}` | 기기 서명·정책 검증 뒤 JSON ABI v2로 실행하는 통합 시험 |
| 태양광 2004/v2 | 측정 배열, 배출계수, 프로젝트 배출량 | 기준선·프로젝트 배출량·순감축량 객체와 측정 건수 | JSON 입출력 통합 시험용이며 승인된 탄소 방법론이 아님 |

| 샘플 | 입력 | 검증 | 결과 |
|---|---|---|---|
| PET 1003 / 2003/v1 | `petBottleCount=3` (1..100000) | `DECLARED_INPUTS_V1`: 파트너 신고 입력 | `estimated_co2e=60 gCO2e` |
| 텀블러 1001 / 2001/v4 | 서명 측정 합계 850 mL | 기기 서명·정책·예약 검증 + JSON ABI v2 | `avoided_pet_co2e=20 gCO2e` 객체 |
| 태양광 1004 / 2004/v2 | 발전량 측정 2건과 시험용 배출값 | JSON Schema 입력 검증 + JSON ABI v2 | 기준선 `450.1125`, 순감축량 `440.1125` tCO2e 시험 객체 |

PET는 `count × 20`, 텀블러는 `floor(mL / 500) × 20`입니다. **20은 연동 시험용 계수입니다. PET 패키지는 실제 폐기·재활용이나 공식 감축량을 증명하지 않습니다. 텀블러 v3는 기존 ABI 패키지로 보존하고 v4부터 JSON ABI v2를 사용합니다.**

GitHub 빌드 성공은 Registry 승인이나 운영 기본 버전 변경을 뜻하지 않습니다. 노드는 가장 높은 버전이 아니라 **Claim에 고정된 버전·hash**를 사용합니다.

## 검증된 빌드

<!-- builds:start -->
검증 시각: 2026-11-04T00:53:15.280Z (UTC)
소스 커밋: `a7496c474b59e2f180da0248c5f94142d1817c92` · Node v22.23.4
[GitHub Actions 실행 기록](https://github.com/RecycleFarm/dmrvn-methodologies/actions/runs/41749995588)
[기계 판독용 catalog.json](builds/catalog.json)

| 방법론 | 활동 | WASM | manifest | 정책 | 빌드 정보 |
|---|---|---|---|---|---|
| 2003/v1 | 1003 | [44 bytes](builds/pet/2003-v1/methodology.wasm) | [JSON](builds/pet/2003-v1/manifest.json) | Not required (declared inputs) | [wabt 1.0.37, 3 vectors](builds/pet/2003-v1/build-info.json) |
| 2001/v3 | 1001 | [48 bytes](builds/tumbler/2001-v3/methodology.wasm) | [JSON](builds/tumbler/2001-v3/manifest.json) | [JSON](builds/tumbler/2001-v3/device-policy.json) | [wabt 1.0.37, 6 vectors](builds/tumbler/2001-v3/build-info.json) |
| 2003/v3 | 1003 | [89544 bytes](builds/pet/2003-v3/methodology.wasm) | [JSON](builds/pet/2003-v3/manifest.json) | Not required (declared inputs) | [rustc rustc 1.85.1 (4eb161250 2025-03-15), 2 vectors](builds/pet/2003-v3/build-info.json) |
| 2004/v2 | 1004 | [108215 bytes](builds/solar/2004-v2/methodology.wasm) | [JSON](builds/solar/2004-v2/manifest.json) | Not required (declared inputs) | [rustc rustc 1.85.1 (4eb161250 2025-03-15), 2 vectors](builds/solar/2004-v2/build-info.json) |

### 2003/v1

- wasmHash: `0x60265f20ca003ae4b20f0bca18f73d0d4e9bb7c9497627d7f680113dac4c91d9`
- methodologyHash: `0xdcc09ee621f2e388dd858f8f7399dbf2725cbec3526d52b0dd06909da892ff77`

### 2001/v3

- wasmHash: `0xcff1a1905d2541aabdbff86181bf0314b6ad5b93fb175469a332b89ee6e9ba84`
- methodologyHash: `0x9591f325e7ce716ab9a4a61a21cc5e5a3afbcf814092636f0a861febc236b03c`

### 2003/v3

- wasmHash: `0x8d7b604b5b02a30d6dda9927ec9657bb28fbccf15850958d6cdb20f3dd696b53`
- methodologyHash: `0x4aff2b393d0d4d9fd4e4144845a4ad4058ad693115ce8643310ae81144578370`

### 2004/v2

- wasmHash: `0x6c501cf75708c5116a51f7e064c62b7d7a2d08f95e2e22742211ba992b9450a8`
- methodologyHash: `0xae7b574f9f78c830ebbe407b51ad1b384b94ab10173dc651decdb5121792307c`
<!-- builds:end -->

## 수정·검증

legacy ABI 방법론은 `methodologies/<분류>/<ID>-v<version>/`에 `definition.json`, `methodology.wat`, `vectors.json`을 둡니다. 신규 JSON ABI 방법론은 같은 디렉터리에 `definition.json`, `vectors.json`, `package-config.json`과 독립 `wasm/` Cargo crate를 둡니다. `package-config.json`은 `JSON_WASM_V2` 런타임과 crate 디렉터리를 지정하고, crate는 공용 ABI 매크로를 호출해 자기 계산 함수만 연결합니다. 새 방법론은 공용 Rust 런타임·빌더에 방법론 이름이나 계산 분기를 추가하지 않습니다. 새 입력·출력은 JSON Schema로 정의하고 Rust 계산 함수에서 JSON을 직접 파싱·생성합니다. 기존 승인 버전은 수정하지 않습니다.

```bash
npm run setup:wasm
npm ci --ignore-scripts
npm test
npm run verify:all
npm run verify:reproducible
```

`ai-workspace`에서 PET·태양광을 서버리스/Attestor와 함께 검증할 때는 패키지를 다시 빌드한 뒤 `npm run sync:workspace-fixtures`를 실행합니다. 이 명령은 검증된 `manifest.json`, `methodology.wasm`, `vectors.json`을 두 저장소의 테스트 fixture에 그대로 복사하며 배포·Registry 등록은 하지 않습니다. CI나 리뷰 전에는 `npm run verify:workspace-fixtures`로 복사본의 바이트·버전 일치를 확인합니다. downstream 테스트는 방법론 버전과 WASM hash도 고정하므로 서로 다른 바이너리를 쓰면 실패합니다. 새 방법론 버전을 추가하면 이 동기화 목록과 해당 모듈의 fixture 기대값을 함께 갱신합니다.

JSON ABI용 Rust 버전은 `rust-toolchain.toml`이 단일 기준입니다. `npm run setup:wasm`은 npm 패키지 설치 전에도 실행할 수 있으며, 해당 Rust 버전과 WASM 타깃만 준비합니다. 빌드는 PATH의 임의 Cargo 대신 pin된 Cargo/Rustc를 선택하며 lockfile을 강제합니다. 툴체인이나 WASM 타깃이 없거나 버전이 다르면 필요한 조치를 오류로 표시합니다. Cargo 의존성 캐시와 빌드 산출물은 기본적으로 저장소의 무시되는 경로에 둡니다. `CARGO_HOME`과 target 경로는 Rust 출력에서 고정 경로로 remap하며, 빌드기가 로컬 경로 누출을 검사합니다. 따라서 셸별 캐시·target 위치가 WASM bytes나 `wasmHash`에 영향을 주지 않아야 합니다. 의도적인 캐시 경로 변경은 `DMRVN_CARGO_HOME`, 격리 빌드 디렉터리는 `DMRVN_WASM_TARGET_DIR`로 지정할 수 있습니다.

`npm run verify:all`은 legacy ABI와 JSON ABI 패키지를 모두 빌드하고 검증합니다. `npm run build:json`과 `npm run verify:json`은 JSON ABI만 따로 빌드하거나 기존 산출물을 검사할 때 사용할 수 있습니다. GitHub Actions도 같은 pin과 WASM 타깃을 설치한 뒤 테스트, 전체 검증, 재현성 검증을 실행합니다. 기본 브랜치에서 성공하면 `builds/`와 이 목록을 자동 커밋합니다. PR은 검증만 합니다. `wasmHash`는 bytes의 keccak256, `methodologyHash`는 manifest의 정렬 JSON/JCS 허용 부분집합 keccak256입니다. 상세 검증 근거는 [VALIDATION.md](VALIDATION.md)를 참고합니다.
