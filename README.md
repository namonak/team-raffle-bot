# 쿠웨이트박 · Team Raffle Bot

자, 후보 올려봐. 나머지는 내가 돌린다.

Teams 단체 대화방에서 후보 중 원하는 수를 중복 없이 뽑는 봇입니다.
`team-meal-bot`, `team-poll-bot`과 같은 TypeScript·Microsoft Agents SDK·SQLite·Docker Compose 구조를 사용합니다.

## 사용 방법

| 호출 | 동작 |
| --- | --- |
| `@쿠웨이트박` | 제목·후보·추첨 개수를 입력하는 카드 |
| `@쿠웨이트박 도움말` | 사용법 |
| `@쿠웨이트박 짜장 짬뽕 볶음밥` | 1개 추첨 |
| `@쿠웨이트박 홍길동 김철수 이영희 2명` | 2개 추첨 |
| `@쿠웨이트박 서울 부산 제주 2곳` | 2개 추첨 |

Teams에서 이름을 입력한 뒤 실제 봇 멘션을 선택해 전송합니다. 개인 대화와 팀 채널은 지원하지 않습니다.

입력 카드에서는 뽑기 제목, 한 줄에 하나씩 후보, 추첨 개수를 적고 **좋아, 판 돌려!**를 누릅니다.
카드를 연 사람만 시작할 수 있고, 시작 전 카드의 유효기간은 24시간입니다.
입력 카드가 그대로 진행 카드와 결과 카드로 바뀝니다. 시작 뒤 진행·결과 카드를 새 메시지로 보내지 않습니다.

직접 호출은 공백·탭·줄바꿈으로 후보를 구분합니다. 마지막에 숫자 또는 숫자 바로 뒤에 `명`, `개`, `곳`을 붙이면 추첨 개수입니다.
개수를 생략하면 1개입니다. `2 명`처럼 숫자와 단위를 나누지 않습니다.
마지막 숫자는 항상 개수이므로 숫자 후보는 `1번`처럼 적습니다.
후보 이름에 공백이 있으면 입력 카드를 이용합니다. 카드에서는 마지막 숫자도 후보명이며 추첨 개수는 별도 필드에서 읽습니다.

후보는 2~50개, 후보명은 1~50자, 제목은 1~100자, 전체 입력은 3,000자 이내입니다.
동일 후보, 후보 1개, 0·음수·소수 개수, 후보 수 이상의 추첨 개수는 거절합니다.
앞뒤 공백과 유니코드 NFC 정규화 후 같은 이름은 중복입니다. 대소문자와 내부 공백은 구분합니다.
카드 개수는 숫자로만 입력하며 단위를 붙이지 않습니다.

## 추첨과 카드 갱신

- Node 표준 `crypto.randomInt`로 모든 후보에 같은 확률을 부여해 중복 없이 추첨합니다.
- 결과는 시작 시 한 번 확정·저장합니다. 중계 문구가 당첨 확률을 바꾸지 않습니다.
- 정상 상태에서는 약 1.75초 간격으로 짧은 중계를 갱신하고 약 7~8초 뒤 결과를 남깁니다.
- 카드에는 텍스트만 표시합니다. 복수 당첨자의 표시 순서는 순위가 아닙니다.
- 같은 방은 한 판씩 진행하고 다른 대화방의 판은 독립적으로 처리합니다.
- 같은 요청 재전달·버튼 이중 클릭은 새 추첨을 만들지 않습니다.
- 중계 갱신이 실패하면 연출을 생략하고 최종 결과를 우선 반영합니다.
- 429 응답은 Retry-After를 존중하고, 일시 장애는 대기 시간을 늘려 재시도합니다.
- 재시작하면 미완료 중계를 반복하지 않고 저장된 결과로 마무리합니다.

Teams와 네트워크 지연에 따라 중간 장면이 생략되거나 표시가 늦을 수 있습니다.
봇 API에는 [요청 제한과 재시도 규칙](https://learn.microsoft.com/en-us/microsoftteams/platform/bots/how-to/rate-limit)이 있습니다.
사용자에게 보인 결과를 바꾸는 재추첨 버튼은 없습니다. 새 판은 봇을 다시 호출합니다.

## 로컬 개발

Node 24 이상, npm, bash, zip, unzip이 필요합니다.

```bash
npm ci
npm test
npm run typecheck
npm run build
cp .env.example .env
```

`.env`에 쿠웨이트박 전용 앱 정보를 입력한 뒤 실행합니다.

```bash
node --env-file=.env --import tsx src/index.ts
# 또는 빌드 결과 실행
node --env-file=.env dist/index.js
```

`npm start`는 셸 환경 변수를 사용하며 `.env`를 자동으로 읽지 않습니다.
인증 필수값이 빠지면 서버 시작을 거부합니다. `PUBLIC_BASE_URL`은 운영 주소 기록용이며 서버 바인딩이나 프록시를 자동 설정하지 않습니다.

| 변수 | 값 |
| --- | --- |
| `MicrosoftAppId` | 쿠웨이트박용 Microsoft 앱 클라이언트 ID |
| `MicrosoftAppPassword` | 앱 클라이언트 비밀값 |
| `MicrosoftAppTenantId` | Microsoft 365 테넌트 ID |
| `PUBLIC_BASE_URL` | 제안값 `https://raffle-bot.namonak.dev` |
| `DATABASE_PATH` | 로컬 `./data/team-raffle-bot.sqlite`, 컨테이너 `/data/team-raffle-bot.sqlite` |
| `PORT` | 컨테이너 내부 `3978` |

테스트는 입력·추첨 경계값, 소유권과 실제 메시지 ID 대조, 중복·동시 요청, SQLite 재개방, 갱신 실패·재시작, SDK 동일 카드 갱신, 인증, ZIP·아이콘을 확인합니다.
서버 테스트는 포트 없이 실제 Express 처리기를 호출합니다. 외부 Teams 인증·렌더링을 대신하지 않습니다.

## 서버 배포

1. NAS 등의 `/volume1/docker/team-raffle-bot`에 프로젝트를 놓고 `.env`를 설정합니다. 기존 봇의 앱 ID와 비밀값을 재사용하지 않습니다.
2. DNS·HTTPS 인증서를 준비하고 프록시에서 `https://raffle-bot.namonak.dev`를 `127.0.0.1:3980`으로 전달합니다.
3. `docker compose up -d --build`를 실행합니다. 구형 환경에서는 `docker-compose`를 사용합니다.
4. `curl https://raffle-bot.namonak.dev/healthz`의 `{"ok":true}` 응답을 확인합니다.

호스트 포트는 식사 봇 3978, 투표곰 3979와 겹치지 않는 **3980**입니다.
운영 도메인은 제안값입니다. 실제 주소를 바꾸면 `.env`, DNS·프록시, 봇 endpoint, `appPackage/manifest.json`의 `validDomains`를 함께 맞춥니다.
단일 프로세스·단일 컨테이너로 실행합니다. 같은 DB를 여러 봇 인스턴스에 연결하지 않습니다.
데이터는 `raffle-data` 볼륨에 보존하며, `docker compose down -v`는 볼륨을 삭제하므로 사용하지 않습니다.

Nginx 예시:

```nginx
location / {
  proxy_pass http://127.0.0.1:3980;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

systemd를 쓰려면 `deploy/team-raffle-bot.service`의 WorkingDirectory와 Docker 경로를 서버에 맞게 바꿉니다.

```bash
sudo cp deploy/team-raffle-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now team-raffle-bot
```

## Teams 앱 등록과 설치

Teams Developer Portal·Azure Bot에서 쿠웨이트박용 앱을 등록하고 Teams 채널을 연결합니다.
메시징 endpoint는 `https://raffle-bot.namonak.dev/api/messages`이며 앱 ID·비밀값·테넌트는 서버 설정과 일치해야 합니다.
조직에서 사용자 지정 앱 설치를 허용해야 합니다.

프로젝트 루트에서 실행합니다.

```bash
bash scripts/package-teams-app.sh
```

환경 변수 또는 `.env`의 `MicrosoftAppId`로 manifest의 앱 ID를 치환합니다.
ID는 UUID 형식이어야 하며 `.env`를 셸 코드로 실행하지 않습니다.
출력은 한국 시간 기준 `dist/team-raffle-bot-YYYYMMDD-HHMMSS.zip`입니다.
ZIP에는 `manifest.json`, `color.png`, `outline.png`만 들어가며 비밀값은 들어가지 않습니다.
이 ZIP을 Teams 사용자 지정 앱으로 업로드하고 단체 대화방에 추가합니다.
이름·아이콘·manifest를 변경하면 manifest version을 올려 새 ZIP으로 업데이트합니다.

manifest 1.22의 commandLists에 단일·복수 추첨 예시 두 개를 선언했습니다.
실제 제안 UI의 위치와 표시 형태는 Teams 클라이언트에서 확인해야 합니다.

제공된 원본 PNG를 참고해 내장 ImageGen으로 아이콘 두 형태를 생성했습니다. 사용이 끝난 루트 원본은 2026-10-15 사용자 요청으로 삭제했습니다.
`appPackage/color.png`는 192×192 컬러, `appPackage/outline.png`는 32×32 투명 배경의 흰색 단색입니다.
생성 후 규격 크기로 내보내고 외곽선 아이콘 RGB를 순백색으로 정규화했으며 알파 채널은 보존했습니다.

- 컬러 프롬프트: 원본의 곱슬머리·선글라스·콧수염·능청스러운 미소를 유지한 얼굴 중심 Teams 정사각형 아이콘. 금색 배경, 글자·둥근 모서리 제외.
- 외곽선 프롬프트: 같은 특징의 얼굴을 32픽셀에서도 보이도록 단순화한 흰색 단색 마크. 투명 배경, 두꺼운 형태, 색·그림자·글자 제외.

## 장애 확인과 복구

```bash
docker compose logs --tail=100 bot
```

`추첨 카드 갱신: ID retry`는 저장된 결과를 자동으로 다시 반영한다는 뜻입니다.
`attention`은 삭제된 카드나 권한 오류처럼 운영 확인이 필요한 상태입니다.
`입력 카드 게시 확인 필요` 또는 `추첨 카드 게시 확인 필요`는 최초 게시 응답 유실 가능성을 포함합니다.
메시지 ID를 모르는 상태에서 자동 재게시하면 카드가 중복될 수 있어 멈춥니다.
게시가 불확실한 방은 관리자 확인 전 새 추첨도 막습니다. 확정 결과는 DB에 그대로 남습니다.

아래 복구는 봇을 중지하고 실제 대화방 게시 상태를 확인한 뒤에만 수행합니다.
메시지 ID는 Teams 메시지의 링크 복사 또는 운영 도구로 확인합니다.

```bash
docker compose stop bot
```

게시가 확인된 경우 아래 `종류`를 `draft` 또는 `raffle`로, ID 두 개를 실제 값으로 바꿉니다.
`draft`는 입력 카드 게시 로그, `raffle`은 추첨 카드 게시·갱신 로그에 해당합니다.
입력 카드는 ready로 연결하고, 추첨은 저장된 당첨자를 유지한 채 최종 결과 반영을 예약합니다.

```bash
docker compose run --rm -T --no-deps bot node --input-type=module - 'raffle' '작업 ID' 'Teams 메시지 ID' <<'NODE'
import { DatabaseSync } from 'node:sqlite';
const [kind,id,messageId]=process.argv.slice(2);
if(!['draft','raffle'].includes(kind)||!id||!messageId)throw new Error('종류와 ID를 확인하세요');
const db=new DatabaseSync(process.env.DATABASE_PATH);
const status=kind==='draft'?'ready':'retry';
const result=db.prepare(`UPDATE ${kind} SET status=?, data=json_set(data,
  '$.status', ?, '$.messageId', ?, '$.stage', 4, '$.nextAt', 0)
  WHERE id=? AND status IN ('uncertain','attention')`).run(status,status,messageId,id);
if(result.changes!==1)throw new Error('복구할 작업이 없거나 상태가 다릅니다');
db.close();
NODE
docker compose start bot
```

게시되지 않았음을 확인했거나 삭제된 판을 취소할 경우, 아래 명령으로 상태만 취소합니다.
후보·당첨자는 지우지 않으며 같은 요청을 재추첨하지 않습니다. 새 판은 새 호출로 시작합니다.

```bash
docker compose run --rm -T --no-deps bot node --input-type=module - 'raffle' '작업 ID' <<'NODE'
import { DatabaseSync } from 'node:sqlite';
const [kind,id]=process.argv.slice(2);
if(!['draft','raffle'].includes(kind)||!id)throw new Error('종류와 ID를 확인하세요');
const db=new DatabaseSync(process.env.DATABASE_PATH);
const result=db.prepare(`UPDATE ${kind} SET status='cancelled',
  data=json_set(data,'$.status','cancelled') WHERE id=? AND status IN ('uncertain','attention')`).run(id);
if(result.changes!==1)throw new Error('취소할 작업이 없거나 상태가 다릅니다');
db.close();
NODE
docker compose start bot
```

## 백업

DB에는 후보와 사용자·대화방 식별자가 있습니다. 데이터와 백업 접근 권한을 제한합니다.
초기 버전은 기록을 자동 삭제하지 않습니다.

```bash
mkdir -p backups
docker compose stop bot
docker cp team-raffle-bot:/data/team-raffle-bot.sqlite "backups/team-raffle-bot-$(date +%Y%m%d-%H%M%S).sqlite"
docker compose start bot
```

복원 시 봇을 멈추고 현재 DB를 별도로 보관한 뒤 복사합니다.

## 실제 Teams 확인 목록

- 두 계정으로 입력 카드 소유권, 만료·오류 안내, 수정 중 입력 유지 확인.
- 텍스트·카드 입력의 단일·복수 추첨, 빠른 이중 클릭, 같은 방 동시 요청 확인.
- 시작 후 원래 카드만 바뀌고 결과까지 메시지가 추가되지 않는지 확인.
- 데스크톱·모바일에서 명령 제안, 줄바꿈, 텍스트 중계와 최종 결과 확인.
- 서버 재시작 후 확정 결과 유지와 같은 카드 복구 확인.

설계는 [설계 문서](docs/superpowers/specs/2026-10-15-team-raffle-bot-design.md), 구현 순서는 [구현 계획](docs/superpowers/plans/2026-10-15-team-raffle-bot.md)에 기록했습니다.


## 검증 기록 (2026-10-15)

- 네트워크 권한 변경 후 `npm ci`로 새 설치 완료.
- `npm test` 22개 통과, `npm run typecheck`, `npm run build` 통과.
- 간접 의존성 proxy-addr를 2.0.8로 갱신해 `npm audit` 경고 0건 확인.
- Compose 설정 검사 통과. Docker 데몬이 없어 이미지 빌드·실행은 미검증.
- 실제 Teams 설치·명령 제안·중계 렌더링·입력값 유지는 위 확인 목록에 따라 별도 검증 필요.
