<div align="center">
  <div>
    <img src=".github/logo-grad.svg" alt="OpenCommit logo"/>
    <h1 align="center">OpenCommit CN</h1>
    <h4 align="center">原作者 <a href="https://twitter.com/_sukharev_"><img src="https://img.shields.io/twitter/follow/_sukharev_?style=flat&label=_sukharev_&logo=twitter&color=0bf&logoColor=fff" align="center"></a>
  </div>
	<h2>利用 AI 自动生成 Git 提交信息（简中强化版）</h2>
	<p>使用 AI 消灭没有意义的 commit message 🤯🔫</p>
	<a href="https://www.npmjs.com/package/opencommit"><img src="https://img.shields.io/npm/v/opencommit" alt="Current version"></a>
</div>

---

<div align="center">
    <img src=".github/opencommit-example.png" alt="OpenCommit example"/>
</div>

## 安装


### NPM
```bash
npm install -g opencommit-cn
```

### PNPM
```bash
pnpm install -g opencommit-cn
```

## 特性
1. 中文强化：强化中文 Prompt 支持，更符合中文习惯
2. 新增 AI 服务商：增加对 火山引擎（OCO_AI_PROVIDER=volcengine） 的支持
3. UI优化：对命令行交互进行了汉化

## 使用方式
- 基本使用方式请参考 [opencommit](https://github.com/di-sukharev/opencommit) 文档
- 火山引擎（OCO_AI_PROVIDER=volcengine） 配置请参考以下配置

```bash
OCO_ONE_LINE_COMMIT=true
OCO_MODEL=doubao-seed-1-6-flash-250828
OCO_API_URL=https://ark.cn-beijing.volces.com/api/v3
OCO_API_KEY=<替换成你的火山引擎 API Key>
OCO_API_CUSTOM_HEADERS=undefined
OCO_AI_PROVIDER=volcengine
OCO_TOKENS_MAX_INPUT=32768
OCO_TOKENS_MAX_OUTPUT=500
OCO_DESCRIPTION=true
OCO_EMOJI=false
OCO_LANGUAGE=zh_CN
OCO_MESSAGE_TEMPLATE_PLACEHOLDER=$msg
OCO_PROMPT_MODULE=conventional-commit
OCO_TEST_MOCK_TYPE=commit-message
OCO_OMIT_SCOPE=false
OCO_GITPUSH=true
OCO_WHY=false
OCO_HOOK_AUTO_UNCOMMENT=false
```
