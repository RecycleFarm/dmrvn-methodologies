# DMRVN WASM 방법론

방법론 소스·빌드·테스트·공개 패키지를 관리하는 독립 프로젝트다. 서버리스나 클라이언트를 import하지 않는다. 서버리스는 완성된 패키지를 검증하여 Greenfield에 게시하고 Firestore Registry에 승인한다.

## 현재 패키지

- 활동: 텀블러 `1001`, 방법론 `2001/v3`.
- 입력: 기기 서명에서 독립적으로 재산출한 합산 `waterIntakeMl`.
- 계산: `floor(waterIntakeMl / 500) * 20`, 출력 `avoided_pet_co2e`, 정수 `gCO2e`.
- `20`은 시험용 계수이며 공식 탄소감축량이나 크레딧 발급 기준이 아니다.
- `packages/tumbler-2001-v3`는 `recyclefarm-test` Registry와 실제 Greenfield에서 읽은 공개 manifest·모듈·검증 정책이다. 개인키·사용자 Evidence는 포함하지 않는다.

```text
WAT 소스 + definition.json + 공개 기기 정책 + vectors.json
  -> pinned wabt 빌드 -> manifest.json + methodology.wasm
  -> 서버리스: hash·실행 테스트 -> Greenfield 게시 -> Registry 승인
  -> 기본 버전 선택 -> 새 Evidence/Claim에 버전과 hash 고정
  -> Attestor: 같은 bytes 검증·실행 -> Aggregator: 재실행
  -> Final Report 실행 정보 -> 온체인 outputHash/reportHash
```

## 파일 구성

| 경로 | 내용 |
|---|---|
| `methodologies/tumbler/2001-v3/methodology.wat` | 수정 가능한 계산 소스 |
| `definition.json` | 방법론 식별자·input/output schema·ABI |
| `vectors.json` | 입력별 예상 출력 |
| `packages/tumbler-2001-v3` | 기존 승인본 보존; 수정하지 않음 |
| `dist/tumbler-2001-v3` | 재빌드 결과; Git 제외 |
| `build-info.json` | 소스·definition hash와 컴파일러 버전·옵션; manifest 외부 추적 자료 |

ABI는 `compute(i32 waterIntakeMl) -> i32`이며 imports 없이 동작한다. 서버 런타임은 모듈 64 KiB, Worker 실행 500 ms 등 기존 제한을 적용한다. 검증기는 무한 실행을 Worker timeout으로 차단한다. 새 종류의 ABI가 필요하면 런타임 변경이 필요하며, 현재 ABI 내 수식 수정은 클라이언트 업데이트 없이 가능하다.

## 빌드와 검증

```bash
npm ci --ignore-scripts
npm test
npm run build
npm run verify -- dist/tumbler-2001-v3
```

v3 재빌드의 hash는 기존 승인본과 같아야 한다:

```text
wasmHash:        0xcff1a1905d2541aabdbff86181bf0314b6ad5b93fb175469a332b89ee6e9ba84
methodologyHash: 0x9591f325e7ce716ab9a4a61a21cc5e5a3afbcf814092636f0a861febc236b03c
```

`wasmHash`는 원본 bytes의 keccak256, `methodologyHash`는 manifest의 정렬 JSON/JCS 허용 부분집합 keccak256이다. manifest는 `wasmHash`와 공개 기기 정책 hash를 포함한다. 소수·NaN·undefined·음수 0·잘못된 Unicode 등 모호한 값은 거부한다. hash 일치는 승인된 코드의 무결성을 확인하며, 각 노드가 실제 실행했다는 암호학적 실행 증명은 아니다.

## 4번 실습: 직접 수정하고 새 버전 게시

실습 전에 변경된 서버리스 API와 Aggregator를 테스트 프로젝트에 한 번 배포하고, 웹 개발 서버 및 Attestor를 최신 코드로 재실행한다. 이번 프로젝트 분리 작업에서 클라우드 배포나 기본 버전 전환은 자동 수행하지 않았다.

```bash
# recyclefarm-serverless 디렉터리
firebase deploy --project recyclefarm-test --only functions:http-dmrvn-api,functions:schedule-processDmrvnAggregation
```

컨트랙트나 EIP-712 타입 변경은 없다. 이 한 번의 연동 배포 이후에는 동일 ABI의 수식·버전 변경마다 Client/API 코드를 고치거나 재배포할 필요가 없다.

1. `methodologies/tumbler/2001-v3` 폴더를 `2001-v4`로 복사한다.
2. 새 `definition.json`의 `methodology.version`을 `4`로 바꾼다.
3. 새 WAT의 `i32.const 20`을 시험용으로 `i32.const 24`로 바꾼다. `coefficientNotice`와 vectors의 예상값도 함께 변경한다. 예: `850 -> 24`, `1000 -> 48`, `1000000 -> 48000`.
4. v3 공개 기기 정책은 그대로 사용하여 새 버전을 빌드한다.

```bash
npm run build -- methodologies/tumbler/2001-v4 packages/tumbler-2001-v3/device-policy.json
npm run verify -- dist/tumbler-2001-v4
```

서버리스 functions 디렉터리에서 먼저 게시 전 검증을 한다:

```bash
yarn dmrvn:publish-tumbler --package ../../dmrvn-methodologies/dist/tumbler-2001-v4 --check
```

테스트 프로젝트에 게시하고 **신규 Evidence의 기본값**으로 선택한다:

```bash
yarn dmrvn:publish-tumbler --cloud --package ../../dmrvn-methodologies/dist/tumbler-2001-v4 --activate
```

`--cloud`를 빼면 로컬 Firestore 8082를 쓴다. Greenfield는 기존 설정의 실제 testnet을 사용하며 저장 가스가 발생한다. 키는 서버리스의 기존 환경설정만 사용한다. 이 프로젝트에 개인키를 넣지 않는다. `--activate`를 빼면 버전을 게시·승인하되 신규 제출의 기본값은 바꾸지 않는다.

기존 버전에 다른 내용으로 게시하면 거부된다. 기존 Evidence의 준비 재시도와 진행 중 Claim은 기존 버전을 유지한다. 웹에서 반드시 새 요청으로 테스트한다. 공개 GitHub 업로드만으로 Registry 승인이나 기본 버전 변경이 이루어지지는 않는다.

## 결과를 확인하는 곳

| 확인 위치 | 정상 결과 |
|---|---|
| 빌드/게시 콘솔 | v4와 새 `wasmHash`·`methodologyHash`, vectors 통과 |
| `dmrvnMethodologies/2001-4` | `ACTIVE`, 새 hash와 Greenfield 포인터 |
| `dmrvnMethodologyDefaults/1001` | `2001/v4`, 새 methodologyHash |
| 새 Evidence·Claim·`dmrvnTasks` | 모두 v4와 같은 hash; 이전 데이터는 v3 유지 |
| 웹 2·3단계 체크리스트 | manifest 승인·정책 hash와 별도 WASM bytes hash 통과 |
| Attestor 콘솔 | `Methodology verified`, `WASM calculation completed`, 입력 850, 결과 24 gCO2e |
| Aggregator 콘솔 | `Methodology verified`, `WASM recomputation completed`, 같은 입력·결과 |
| `dmrvnTasks/{claimId}.execution` | `methodology`, `methodologyHash`, `wasmHash`, `inputs` |
| Greenfield Final Report | 동일한 방법론 hash, `outputs`, Observation 서명, manifest/WASM 저장 경로 |
| 온체인·웹 최종 조회 | VALID, 보고서와 outputHash/reportHash 일치 |

변조 확인은 승인본을 덮어쓰지 말고 임시 패키지 사본에서 수행한다. `.wasm`만 변경하면 hash 불일치로 `--check`가 실패해야 한다. version을 올리지 않은 수정 패키지는 게시가 거부되어야 한다. v3 기본값으로 되돌릴 때는 v3 보존 패키지를 `--activate`로 다시 게시한다. 이미 생성한 v4 Claim의 버전은 바뀌지 않는다.

## GitHub 공개

로컬 Git 저장소만 구성한다. 원격 저장소 생성·push는 사용자가 한다. 업로드 전 사용 허가 라이선스를 선택한다. 공개 CA 인증서는 포함하지만 CA/기기 개인키, `.env`, service account, 사용자 원본은 공개하지 않는다.
