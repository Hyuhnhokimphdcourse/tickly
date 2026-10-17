# Tickly — 기계식 시계 타임그래퍼 + 컬렉션 (iOS)

iPhone 마이크로 일오차·비트에러·진폭을 재고, 컬렉션·정밀 로그·오버홀 진단을 관리하는 앱입니다.
Expo(React Native) + Swift 마이크 모듈로 만들어 **Mac 없이 Windows에서** 클라우드 빌드(EAS)로 TestFlight에 올릴 수 있습니다.

## 기능

| 탭 | 내용 |
|---|---|
| 측정 | 마이크 타임그래퍼: 일오차(s/d), 비트에러(ms), 진폭(°), BPH 자동 감지(12,000–72,000), 신호 상태(듣는 중/고정/약함/잡음), 타이밍 다이어그램, 자세 태그(DU·DD·CU·CD·CL·CR), 표준/롱 측정 |
| 컬렉션 | 사진 등록, **AI 식별 + 웹 검색 사양**(진동수·리프트각·일오차 사양·파워리저브·권장 오버홀 주기, 출처 링크), 목록/그리드, 즐겨찾기·보관 |
| 시계 상세 | 최근 측정, 상태 진단(탈자/조정/점검/오버홀), 일오차 추이, 자세별 일오차와 편차, 사양 원장, 측정 기록 |
| 정밀 로그 | 초침이 12를 지날 때 탭해서 실제 착용 일오차 계산(회귀 기울기), 사이클 관리, 사양 범위 그래프 |
| 기록 | 오늘 착용, 15주 착용 히트맵, 주간 요약, 설정(API 키·리프트각 기본값·측정 길이), 백업 |

### 측정 원리 (오픈소스 타임그래퍼 tg와 같은 정의)
- 일오차 = 86400 × (공칭 비트 간격 / 측정 비트 간격 − 1)
- 진폭 = 리프트각 / (2·sin(π·τ/T)) — τ: 첫 소리→마지막 소리 시간, T: 밸런스 한 주기(2비트)
- 비트에러 = |T/2 − 틱→톡 간격| (두 반주기 차이의 절반)
- 오디오 끊김(샘플 누락·삽입)으로 생기는 계단형 점프는 구간을 나눠 같은 기울기로 맞춥니다.

합성 틱 신호 13가지 경우 테스트: `npm run test:dsp`
(28,800/21,600/18,000/36,000/25,200 BPH, ±300 s/d, 잡음·클릭·비트 누락·오디오 끊김, 44.1 kHz) — 일오차 오차 ≤ 0.2 s/d, 비트에러 ≤ 0.02 ms, 진폭 ≤ 1°.

> 주의: 폰 오디오 클럭 오차(ppm)는 측정 일오차에 그대로 더해집니다(1 ppm = 0.086 s/d). 실제 착용 일오차는 정밀 로그가 기준입니다.

---

## Windows에서 TestFlight로 설치하기

### 준비물
1. **Apple Developer Program** 가입 (연 $99) — https://developer.apple.com/programs/enroll/
2. **Expo 계정** (무료) — https://expo.dev/signup
3. Windows에 **Node.js LTS** 설치 — https://nodejs.org
4. iPhone에 **TestFlight** 앱 설치 (App Store)

### 빌드·업로드 (명령 프롬프트 또는 PowerShell)
```powershell
cd tickly          # 압축 푼 폴더
npm install
npx eas-cli@latest login      # Expo 계정
npx eas-cli@latest init       # 프로젝트 연결 (app.json에 projectId가 추가됨)
npx testflight                # 인증서 생성 → 클라우드 빌드 → TestFlight 업로드를 한 번에
```
- 처음 실행하면 Apple ID 로그인을 묻습니다. 인증서·프로비저닝 프로필은 EAS가 자동으로 만듭니다.
- 빌드는 Expo 클라우드 Mac에서 15–30분 걸립니다. 처리 후 5–10분이면 TestFlight에 나타납니다.
- App Store Connect → 앱 → TestFlight → 내부 테스터에 본인을 추가하면 iPhone TestFlight 앱에서 설치됩니다.
  내부 테스트는 심사가 없고, 빌드는 90일 뒤 만료됩니다(그때 다시 `npx testflight`).

번들 ID는 `com.hyunhokim.tickly`입니다. 바꾸려면 `app.json`의 `ios.bundleIdentifier`를 수정하세요.

### 빌드가 실패하면
EAS 빌드 페이지의 로그(특히 "Run fastlane" / "Xcode build" 단계)를 복사해서 Claude에게 보내 주세요.
Swift 마이크 모듈(`modules/tick-mic/ios/TickMicModule.swift`)은 실기기 빌드에서 처음 컴파일됩니다.

### AI 식별 쓰기
기록 탭 → 설정에 Claude API 키(https://console.anthropic.com)를 넣습니다. 키는 iOS 키체인에만 저장됩니다.
웹 검색 비용: 1,000회당 $10 + 토큰 비용.

---

## App Store 공개 전에 할 일
- [ ] 앱 아이콘·스플래시 교체 (`assets/`), 앱 이름 상표 확인
- [ ] AI 기능: 앱에 키를 넣지 말고 프록시 서버 경유로 변경 (`src/lib/ai.ts`)
- [ ] 개인정보 처리방침 URL, App Privacy 항목(사진·마이크는 기기 내 처리)
- [ ] 심사 가이드라인 4.1/4.3 대비 차별점 정리: 오버홀 진단, 출처 검증 사양, 한국어
- [ ] 스크린샷 (6.9″, 6.5″)

## 개발
```bash
npx expo start --web     # 브라우저에서 화면 확인 (마이크는 getUserMedia로 동작)
npx tsc --noEmit         # 타입 검사
npx expo lint
npm run test:dsp         # 타임그래퍼 신호처리 테스트
```

## 구조
```
modules/tick-mic/        Swift 마이크 모듈 (AVAudioEngine, measurement 모드, 하단 마이크)
src/dsp/timegrapher.ts   신호처리: BPH 감지, 위상 추적, 일오차·비트에러·진폭
src/audio/               마이크 추상화 (iOS 네이티브 / 웹)
src/lib/                 데이터 모델, 저장소, 진단, 정밀 로그, Claude API
src/app/                 화면 (expo-router)
scripts/                 합성 틱 생성기와 테스트
```

## 참고
- tg (오픈소스 타임그래퍼) — https://github.com/vacaboja/tg
- Watchscanning — 타임그래퍼 판독 — https://www.watchscanning.com/guides/how-to-read-a-timegrapher/
- Watchscanning — 자기화 진단 — https://www.watchscanning.com/guides/magnetized-watch-fix/
- Expo — TestFlight 배포 — https://docs.expo.dev/submit/testflight/
- Apple — TestFlight — https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/
