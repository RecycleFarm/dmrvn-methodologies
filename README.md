# DMRVN WASM Methodologies

DMRVN 노드가 내려받아 실행할 방법론 소스와 검증된 WASM 패키지입니다.

## WASM 사용

1. 아래 빌드 목록에서 필요한 ID/version의 `manifest.json`, `methodology.wasm`, `device-policy.json`을 받습니다.
2. 승인 Registry/Claim에 고정된 `methodologyHash`와 manifest를 비교하고, 모듈 bytes의 keccak256이 `wasmHash`와 같은지 확인합니다.
3. manifest의 input schema와 ABI에 따라 실행하고 output schema로 결과를 해석합니다.

현재 ABI: `compute(i32 waterIntakeMl) -> i32`, imports 없음. 텀블러는 합산 음수량(mL)을 입력받아 `floor(mL / 500) × 20` gCO2e를 계산합니다. **20은 시험용 계수입니다.**

GitHub 빌드 성공은 Registry 승인이나 운영 기본 버전 변경을 뜻하지 않습니다. 노드는 가장 높은 버전이 아니라 **Claim에 고정된 버전·hash**를 사용합니다.

## 검증된 빌드

<!-- builds:start -->
다음 기본 브랜치 workflow 성공 후 자동 갱신됩니다.
<!-- builds:end -->

## 수정·검증

새 버전은 `methodologies/<분류>/<ID>-v<version>/`에 추가합니다. 필수 파일은 `definition.json`, `methodology.wat`, `vectors.json`입니다. 정책은 `device-policy.json` 또는 `package-config.json`의 상대경로 `policyFile`로 지정합니다. 기존 승인 버전은 수정하지 않습니다.

```bash
npm ci --ignore-scripts
npm test
npm run verify:all
```

workflow는 모든 방법론을 자동 빌드·검증합니다. 기본 브랜치에서 성공하면 `builds/`와 이 목록을 자동 커밋합니다. PR은 검증만 합니다. `wasmHash`는 bytes의 keccak256, `methodologyHash`는 manifest의 정렬 JSON/JCS 허용 부분집합 keccak256입니다. 상세 검증 근거는 [VALIDATION.md](VALIDATION.md)를 참고합니다.
