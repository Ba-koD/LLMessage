# LLMessage

AI 기반 Git 커밋 메시지 자동 생성 VS Code 익스텐션.  
OpenAI, Anthropic (Claude), Google Gemini, Local (Ollama 등), 커스텀 엔드포인트를 지원합니다.

---

## 개발 환경 설정

### 사전 요구사항

- [Node.js](https://nodejs.org/) 18 이상
- npm
- [VS Code](https://code.visualstudio.com/)

### 의존성 설치

```bash
npm install
```

---

## 빌드

TypeScript를 컴파일해 `out/` 디렉터리에 JS 파일을 생성합니다.

```bash
npx tsc
```

변경 사항을 감지해 자동으로 재컴파일하려면:

```bash
npx tsc --watch
```

---

## 패키징 (`.vsix` 생성)

```bash
npm run package
```

실행 후 루트 디렉터리에 `llmessage-<version>.vsix` 파일이 생성됩니다.

---

## 설치

생성된 `.vsix` 파일을 VS Code에 설치합니다.

```bash
npm run install:vsix
```

> WSL 환경에서도 자동으로 Windows VS Code에 설치됩니다.

또는 VS Code에서 직접 설치:
1. `Ctrl+Shift+P` → `Extensions: Install from VSIX...`
2. 생성된 `.vsix` 파일 선택

---

## 테스트

```bash
npm test
```

---

## 전체 빌드 → 패키징 → 설치 한 번에

```bash
npx tsc && npm run package && npm run install:vsix
```

---

## 지원 프로바이더

| 프로바이더 | 설정 방법 |
|---|---|
| OpenAI | API 키 등록 |
| Anthropic (Claude) | API 키 등록 |
| Google Gemini | API 키 등록 |
| Local (Ollama 등) | `llmessage.local.url` 설정 (기본값: `http://localhost:11434`) |
| Custom | `llmessage.custom.url` 및 `llmessage.custom.model` 설정 |

API 키는 `LLMessage: Set API Key` 커맨드로 등록합니다 (`Ctrl+Shift+P`).

---

## 라이선스

MIT
