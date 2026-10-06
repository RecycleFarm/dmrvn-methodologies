# 검증 기록

검증일: 2026-10-06. 범위: WASM 프로젝트 분리, 외부 패키지 게시 연동, 버전 선택, 실행 근거와 웹 hash 확인.

| 검증 | 실행 위치·명령 | 결과 |
|---|---|---|
| 소스·안전 제한·재현 빌드 | 이 프로젝트: `npm test` | 4개 통과; 경계 입력·변조·무한 루프·무제한 메모리 거부 |
| 기존 승인본 재현 | `npm run build`, `npm run verify -- packages/tumbler-2001-v3` | 기존 manifest/WASM hash 일치 |
| 서버리스 패키지 import | functions: `yarn dmrvn:publish-tumbler --package ../../dmrvn-methodologies/dist/tumbler-2001-v3 --check` | 공개 정책과 6개 vector 검증 통과; 업로드하지 않음 |
| 서버리스 회귀 | functions: `mocha tests/unit/dmrvn-methodology-package.test.js tests/unit/dmrvn-device-tumbler.test.js tests/unit/dmrvn-partner-api.test.js tests/unit/dmrvn-inspection.test.js tests/unit/dmrvn-aggregation.test.js tests/unit/dmrvn-wasm.test.js --exit` | 43개 통과 |
| Firestore 트랜잭션·조회 | local Emulator 8082: `dmrvn-device-reservations.test.js`, `dmrvn-inspection-api.test.js` | 8개 통과; 동일 버전 변경 경합·기본 버전 전환·기존 원본 보존 |
| 웹 체크리스트 | webapp: `playwright test tests/e2e/dmrvn-workflow.spec.ts` | 7개 통과; 격리된 API/RPC 응답 fixture, WASM 변조 시 다음 CTA 차단 |
| 웹 타입 | webapp: `tsc --noEmit --incremental false` | 통과 |

기존 v3 승인본은 실제 `recyclefarm-test` Registry와 Greenfield에서 읽었다. 클라우드 데이터와 기본 버전은 변경하지 않았다. 서버리스 배포, 실제 v4 게시·활성화, 새 버전의 온체인 전체 흐름은 아직 수행하지 않았다. 사용자가 README의 4번 실습에서 진행한다.

변경된 웹은 API 경유 원본 bytes를 확인한다. 독립적인 Greenfield 직접 조회나 브라우저의 수식 재실행을 수행했다고 주장하지 않는다. 기존 로그·Observation 서명·Aggregator 재계산은 합의 근거이며 신뢰할 수 없는 노드의 실행 증명은 아니다.
