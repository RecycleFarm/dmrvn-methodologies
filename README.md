# DMRVN WASM Methodologies

DMRVN 노드가 내려받아 실행할 방법론 소스와 검증된 WASM 패키지입니다.

## WASM 사용

1. 아래 빌드 목록에서 필요한 ID/version의 `manifest.json`, `methodology.wasm`을 받습니다. 기기 검증 방법론만 `device-policy.json`도 받습니다.
2. 승인 Registry/Claim에 고정된 `methodologyHash`와 manifest를 비교하고, 모듈 bytes의 keccak256이 `wasmHash`와 같은지 확인합니다.
3. manifest의 input schema와 ABI에 따라 실행하고 output schema로 결과를 해석합니다.

현재 ABI: `compute(i32) -> i32`, imports 없음. 입력 이름·순서와 출력 단위는 manifest가 정의합니다.

| 샘플 | 입력 | 검증 | 결과 |
|---|---|---|---|
| PET 1003 / 2003/v1 | `petBottleCount=3` (1..100000) | `DECLARED_INPUTS_V1`: 파트너 신고 입력 | `estimated_co2e=60 gCO2e` |
| 텀블러 1001 / 2001/v3 | 서명 측정 합계 850 mL | 기존 기기 서명·정책·예약 검증 | `avoided_pet_co2e=20 gCO2e` |

PET는 `count × 20`, 텀블러는 `floor(mL / 500) × 20`입니다. **20은 연동 시험용 계수입니다. PET 패키지는 실제 폐기·재활용이나 공식 감축량을 증명하지 않습니다.**

GitHub 빌드 성공은 Registry 승인이나 운영 기본 버전 변경을 뜻하지 않습니다. 노드는 가장 높은 버전이 아니라 **Claim에 고정된 버전·hash**를 사용합니다.

## 검증된 빌드

<!-- builds:start -->
검증 시각: 2026-10-07T07:19:02.397Z (UTC)
소스 커밋: `a450d56b95cf1fd26f8434b10a4b8c2da938e021` · Node v22.23.3
[GitHub Actions 실행 기록](https://github.com/RecycleFarm/dmrvn-methodologies/actions/runs/37586551652)
[기계 판독용 catalog.json](builds/catalog.json)

| 방법론 | 활동 | WASM | manifest | 정책 | 빌드 정보 |
|---|---|---|---|---|---|
| 2003/v1 | 1003 | [44 bytes](builds/pet/2003-v1/methodology.wasm) | [JSON](builds/pet/2003-v1/manifest.json) | Not required (declared inputs) | [wabt 1.0.37, 3 vectors](builds/pet/2003-v1/build-info.json) |
| 2001/v3 | 1001 | [48 bytes](builds/tumbler/2001-v3/methodology.wasm) | [JSON](builds/tumbler/2001-v3/manifest.json) | [JSON](builds/tumbler/2001-v3/device-policy.json) | [wabt 1.0.37, 6 vectors](builds/tumbler/2001-v3/build-info.json) |

### 2003/v1

- wasmHash: `0x60265f20ca003ae4b20f0bca18f73d0d4e9bb7c9497627d7f680113dac4c91d9`
- methodologyHash: `0xdcc09ee621f2e388dd858f8f7399dbf2725cbec3526d52b0dd06909da892ff77`

### 2001/v3

- wasmHash: `0xcff1a1905d2541aabdbff86181bf0314b6ad5b93fb175469a332b89ee6e9ba84`
- methodologyHash: `0x9591f325e7ce716ab9a4a61a21cc5e5a3afbcf814092636f0a861febc236b03c`
<!-- builds:end -->

## 수정·검증

새 버전은 `methodologies/<분류>/<ID>-v<version>/`에 추가합니다. 필수 파일은 `definition.json`, `methodology.wat`, `vectors.json`입니다. 기기 정책은 `device-policy.json` 또는 `package-config.json`의 상대경로 `policyFile`로 지정합니다. `DECLARED_INPUTS_V1`은 기기 정책을 사용하지 않습니다. 기존 승인 버전은 수정하지 않습니다.

```bash
npm ci --ignore-scripts
npm test
npm run verify:all
```

workflow는 모든 방법론을 자동 빌드·검증합니다. 기본 브랜치에서 성공하면 `builds/`와 이 목록을 자동 커밋합니다. PR은 검증만 합니다. `wasmHash`는 bytes의 keccak256, `methodologyHash`는 manifest의 정렬 JSON/JCS 허용 부분집합 keccak256입니다. 상세 검증 근거는 [VALIDATION.md](VALIDATION.md)를 참고합니다.
