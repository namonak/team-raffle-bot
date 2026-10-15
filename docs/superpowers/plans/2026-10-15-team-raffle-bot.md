# 쿠웨이트박 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 텍스트·입력 카드로 시작해 같은 카드에서 중계와 결과를 보여주는 Teams 추첨 봇 구현.

**Architecture:** 투표곰의 파일 역할과 SDK·SQLite·Docker 구조 유지. 입력은 공통 검증 후 한 번 추첨·저장하고 비동기 주기 작업이 같은 메시지를 갱신. 재시작 시 확정 결과로 복구.

**Tech Stack:** Node >=24, TypeScript, Express, @microsoft/agents-hosting, node:sqlite, node:crypto, node:test.

**Spec:** `docs/superpowers/specs/2026-10-15-team-raffle-bot-design.md`

## Global Constraints

- 후보 2~50개, 후보당 50자, 제목 1~100자, 전체 입력 3,000자.
- `1 <= count < 후보 수`, 같은 후보 중복 금지, NFC 정규화.
- 단체 대화방만 지원, 입력 카드 소유자만 시작, 유효기간 24시간.
- `좋아, 판 돌려!`, 기존 카드 메시지 ID 유지, 결과 고정, 런타임 의존성 추가 없음.
- 단일 프로세스, 호스트 3980·컨테이너 3978, 별도 앱·DB·볼륨.
- 커밋 작성자 namonak <namonak@gmail.com>, Codex 트레일러 유지.

## Review Focus

- 숫자처럼 보이는 잘못된 마지막 토큰이 후보로 들어가지 않음: Task 1 테스트.
- 중계 재시도·재시작이 결과를 바꾸지 않음: Task 2 테스트.
- 같은 방 동시 시작과 중복 요청이 두 판을 만들지 않음: Task 2 테스트.
- 카드 갱신 오류와 늦은 중계가 결과를 덮어쓰지 않음: Task 2·3 테스트.
- 큰 입력·Markdown·변조 액션과 타인 요청 거절: Task 1·3 테스트.

## Task 1: 입력과 추첨

**Files:** `src/domain.ts`, `test/domain.test.ts`, 루트 Node·TypeScript 설정.
**Interfaces:** `parseCommand(text): 'create'|'help'|RaffleConfig`, `validateForm(input): RaffleConfig`, `draw(config, random?): string[]`, `RaffleError`.

- [x] 표준 Node 테스트로 텍스트·폼 차이, count 경계, 상한, 중복·NFC·제어 문자, 추첨 불변식을 먼저 작성.
- [x] `node --import tsx --test test/domain.test.ts`에서 미구현 실패 확인.
- [x] 표준 crypto·정규식으로 최소 구현. 단위 3종, 공백 분리와 줄바꿈 분리 유지.
- [x] 같은 명령으로 통과 확인.
- [x] 가능한 경우 `feat(추첨): 후보 입력과 중복 없는 추첨을 구현` 커밋.

## Task 2: 저장·실행·복구

**Files:** `src/store.ts`, `src/service.ts`, `src/scheduler.ts`, `test/store.test.ts`, `test/service.test.ts`.
**Interfaces:** `Store.open(path)`, `RaffleService.createDraft(actor, requestId)`, `startForm(actor,draftId,input)`, `startText(actor,requestId,config)`, `runScheduledTasks()`, `Transport.send(conversationId, card): Promise<string>`, `Transport.update(conversationId,messageId,card): Promise<void>`.
**Consumes:** Task 1 `RaffleConfig`, `validateForm`, `draw`.

- [x] SQLite 재개방, 중복 요청·카드, 소유권·만료, 방별 진행 배제, 최초 게시 불확실성, 갱신 실패·429·재시작 테스트 먼저 작성.
- [x] 해당 테스트 미구현 실패 확인.
- [x] 결과 저장 후 I/O, DB 유일 제약, 비동기 단계별 갱신·결과 재시도 구현.
- [x] 테스트 통과 확인. 영구 오류는 운영 확인 상태로 기록하고 재시도 중단.
- [x] 가능한 경우 `feat(진행): 카드 추첨과 저장된 결과 복구를 추가` 커밋.

## Task 3: Teams 연결과 카드

**Files:** `src/cards.ts`, `src/index.ts`, `test/cards.test.ts`, `test/index.test.ts`.
**Interfaces:** `buildCreateCard(id)`, `buildHelpCard()`, `buildRaffleCard(raffle, stage)`, `createApp(env)`, `createTeamsTransport(adapter,appId,store)`.
**Consumes:** Task 2 저장·서비스와 Transport.

- [x] 입력 필드·버튼·이스케이프, 시작 후 send 0회와 동일 메시지 ID, 인증·변조 액션 테스트 작성 후 실패 확인.
- [x] 투표곰 SDK 패턴으로 연결. invoke는 연출을 기다리지 않고 예약 후 반환.
- [x] 전체 테스트와 `npm run typecheck`, `npm run build` 통과 확인.
- [x] 가능한 경우 `feat(팀즈): 같은 카드에서 입력과 추첨 결과를 표시` 커밋.

## Task 4: 아이콘·패키지·운영 문서

**Files:** `appPackage/*`, `scripts/package-teams-app.sh`, `test/package-teams-app.test.ts`, `Dockerfile`, `compose.yaml`, `.env.example`, `deploy/team-raffle-bot.service`, `README.md`.

- [x] ZIP 구성·ID 치환·아이콘 규격 테스트 작성 후 실패 확인.
- [x] ImageGen으로 원본 특징을 살린 컬러·단색 아이콘 제작, 원본 보존.
- [x] manifest 1.22 명령 제안·별도 도메인, 기존 패키지·Docker 구조 적용.
- [x] README에 입력·운영·테스트·게시 확인 복구·백업·남은 실환경 검증 설명.
- [x] 전체 테스트·typecheck·build·가능한 Docker 확인. 독립 최종 코드 검토 후 중요한 문제 수정·회귀 확인.
- [x] 가능한 경우 `feat(배포): 쿠웨이트박 아이콘과 운영 안내를 추가` 커밋 후 원격 연결·푸시.

## 실행 기록

- 사용자가 설계 검토 및 구현 시작을 명시 승인했으므로 추가 승인 질문 없이 현재 세션에서 순서대로 실행.
- 초기에는 Git 초기화가 `.git: Operation not permitted`로 차단됨. 사용자가 권한을 변경한 뒤 현재 디렉터리에서 정상 초기화.
- 초기에는 GitHub 연결·인증 확인 불가. 권한 변경 후 `namonak` 인증과 API 접근 정상 확인.

### 구현 검증 결과

- Task 1~4의 코드·아이콘·README 작성 완료. 자동 테스트 22개 통과, typecheck·build 통과.
- 독립 검토 2건 수정: 숫자로 시작하는 일반 후보명 허용, SDK replyToId와 저장 메시지 ID 대조. 두 회귀 테스트 모두 수정 전 실패·수정 후 통과.
- 종료 시 진행 중 갱신 대기·중복 주기 작업 방지 테스트 추가.
- Compose 설정 검사 통과. Docker 데몬 부재로 이미지 빌드·실행 미검증.
- 초기 npm ci는 DNS 실패로 기존 설치본을 사용. 권한 변경 후 npm ci 정상 완료 및 22개 테스트·typecheck·build 재검증. proxy-addr를 2.0.7에서 2.0.8로 갱신해 npm audit 경고 0건 확인.
- 설정·추첨·Teams 진행·배포·문서의 5개 작업 단위로 커밋. 저장과 카드 구현은 상호 의존하므로 하나의 Teams 커밋으로 통합. 전용 비공개 원격은 https://github.com/namonak/team-raffle-bot 이며 main 브랜치 게시 대상으로 설정.
- 실제 Teams 설치·명령 제안·입력값 유지·중계 렌더링은 전용 앱 등록 후 확인 필요.

커밋 작성자: `namonak <namonak@gmail.com>`.
커밋 제목 예시: `feat(쿠웨이트박): 같은 카드에서 진행하는 추첨 봇을 추가`.
모든 커밋 본문 마지막에 `Co-authored-by: Codex (AI-generated) <codex@joannes.kr>` 추가.
