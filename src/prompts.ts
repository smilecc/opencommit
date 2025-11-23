import { note } from '@clack/prompts';
import { OpenAI } from 'openai';
import { getConfig } from './commands/config';
import { i18n, I18nLocals } from './i18n';
import { configureCommitlintIntegration } from './modules/commitlint/config';
import { commitlintPrompts } from './modules/commitlint/prompts';
import { ConsistencyPrompt } from './modules/commitlint/types';
import * as utils from './modules/commitlint/utils';
import { removeConventionalCommitWord } from './utils/removeConventionalCommitWord';

const config = getConfig();
const translation = i18n[(config.OCO_LANGUAGE as I18nLocals) || 'en'];

export const IDENTITY = '你将扮演 git 提交消息（commit message）的作者。';

const GITMOJI_HELP = `使用 GitMoji 规范作为提交的前缀。以下是帮助你选择正确表情符号的说明（表情符号，描述）：
🐛, 修复 bug;
✨, 引入新功能;
📝, 添加或更新文档;
🚀, 部署相关;
✅, 添加、更新或通过测试;
♻️, 代码重构;
⬆️, 升级依赖;
🔧, 添加或更新配置文件;
🌐, 国际化和本地化;
💡, 添加或更新源代码注释;`;

const FULL_GITMOJI_SPEC = `${GITMOJI_HELP}
🎨, 改进代码结构/格式;
⚡️, 提高性能;
🔥, 删除代码或文件;
🚑️, 紧急热修复;
💄, 添加或更新 UI 和样式文件;
🎉, 开始一个项目;
🔒️, 修复安全问题;
🔐, 添加或更新密钥;
🔖, 发布/版本标签;
🚨, 修复编译器/linter 警告;
🚧, 进行中的工作;
💚, 修复 CI 构建;
⬇️, 降级依赖;
📌, 将依赖项固定到特定版本;
👷, 添加或更新 CI 构建系统;
📈, 添加或更新分析或跟踪代码;
➕, 添加依赖;
➖, 移除依赖;
🔨, 添加或更新开发脚本;
✏️, 修复拼写错误;
💩, 编写需要改进的糟糕代码;
⏪️, 回滚更改;
🔀, 合并分支;
📦️, 添加或更新编译文件或包;
👽️, 由于外部 API 更改而更新代码;
🚚, 移动或重命名资源（例如：文件、路径、路由）;
📄, 添加或更新许可证;
💥, 引入破坏性更改;
🍱, 添加或更新资产;
♿️, 提高可访问性;
🍻, 醉酒时写的代码;
💬, 添加或更新文本和字面量;
🗃️, 执行数据库相关的更改;
🔊, 添加或更新日志;
🔇, 删除日志;
👥, 添加或更新贡献者;
🚸, 改善用户体验/可用性;
🏗️, 进行架构更改;
📱, 响应式设计工作;
🤡, 模拟事物（Mock）;
🥚, 添加 or 更新彩蛋;
🙈, 添加或更新 .gitignore 文件;
📸, 添加或更新快照;
⚗️, 执行实验;
🔍️, 改进 SEO;
🏷️, 添加或更新类型;
🌱, 添加或更新种子文件;
🚩, 添加、更新或删除功能标志;
🥅, 捕获错误;
💫, 添加或更新动画和过渡;
🗑️, 废弃需要清理的代码;
🛂, 处理与授权、角色和权限相关的代码;
🩹, 简单修复非关键问题;
🧐, 数据探索/检查;
⚰️, 删除死代码;
🧪, 添加一个失败的测试;
👔, 添加 or 更新业务逻辑;
🩺, 添加或更新健康检查;
🧱, 基础设施相关的更改;
🧑‍💻, 改善开发者体验;
💸, 添加赞助或资金相关的基础设施;
🧵, 添加或更新与多线程或并发相关的代码;
🦺, 添加或更新与验证相关的代码。`;

const CONVENTIONAL_COMMIT_KEYWORDS =
  '除了 Conventional Commit 约定的关键字（fix, feat, build, chore, ci, docs, style, refactor, perf, test）外，不要在提交信息前添加任何内容。';

const getCommitConvention = (fullGitMojiSpec: boolean) =>
  config.OCO_EMOJI
    ? fullGitMojiSpec
      ? FULL_GITMOJI_SPEC
      : GITMOJI_HELP
    : CONVENTIONAL_COMMIT_KEYWORDS;

const getDescriptionInstruction = () =>
  config.OCO_DESCRIPTION
    ? '在提交信息后简要描述**为什么**要进行更改。不要以 "This commit" 开头，直接描述变更内容。'
    : '不要向提交添加任何描述，仅保留提交信息。';

const getOneLineCommitInstruction = () =>
  config.OCO_ONE_LINE_COMMIT
    ? '编写一条简洁的单句提交信息，概括所有更改，并重点强调主要更新。如果修改有共同的主题或范围，请简洁地提及；否则，省略范围以保持重点。目标是在一条消息中提供清晰统一的变更概览。'
    : '';

const getScopeInstruction = () =>
  config.OCO_OMIT_SCOPE
    ? '提交信息格式中不要包含作用域（scope）。使用格式：<type>: <subject>'
    : '';

/**
 * Get the context of the user input
 * @param extraArgs - The arguments passed to the command line
 * @example
 * $ oco -- This is a context used to generate the commit message
 * @returns - The context of the user input
 */
const userInputCodeContext = (context: string) => {
  if (context !== '' && context !== ' ') {
    return `用户提供的额外上下文：<context>${context}</context>\n生成提交信息时请考虑此上下文，并在适当时整合相关信息。`;
  }
  return '';
};

const INIT_MAIN_PROMPT = (
  language: string,
  fullGitMojiSpec: boolean,
  context: string
): OpenAI.Chat.Completions.ChatCompletionMessageParam => ({
  role: 'system',
  content: (() => {
    const commitConvention = fullGitMojiSpec
      ? 'GitMoji 规范'
      : 'Conventional Commit 约定';
    const missionStatement = `${IDENTITY} 你的任务是根据 ${commitConvention} 创建清晰且全面的提交信息，并解释**做了什么**更改，主要是**为什么**要进行这些更改。`;
    const diffInstruction =
      "我将发送 'git diff --staged' 命令的输出给你，你需要将其转换为提交信息。";
    const conventionGuidelines = getCommitConvention(fullGitMojiSpec);
    const descriptionGuideline = getDescriptionInstruction();
    const oneLineCommitGuideline = getOneLineCommitInstruction();
    const scopeInstruction = getScopeInstruction();
    const generalGuidelines = `使用一般现在时。每行不得超过 74 个字符。必需使用 ${language} 编写提交信息。`;
    const userInputContext = userInputCodeContext(context);

    return `${missionStatement}\n${diffInstruction}\n${conventionGuidelines}\n${descriptionGuideline}\n${oneLineCommitGuideline}\n${scopeInstruction}\n${generalGuidelines}\n${userInputContext}`;
  })()
});

export const INIT_DIFF_PROMPT: OpenAI.Chat.Completions.ChatCompletionMessageParam =
  {
    role: 'user',
    content: `diff --git a/src/server.ts b/src/server.ts
    index ad4db42..f3b18a9 100644
    --- a/src/server.ts
    +++ b/src/server.ts
    @@ -10,7 +10,7 @@
    import {
        initWinstonLogger();
        
        const app = express();
        -const port = 7799;
        +const PORT = 7799;
        
        app.use(express.json());
        
        @@ -34,6 +34,6 @@
        app.use((_, res, next) => {
            // ROUTES
            app.use(PROTECTED_ROUTER_URL, protectedRouter);
            
            -app.listen(port, () => {
                -  console.log(\`Server listening on port \${port}\`);
                +app.listen(process.env.PORT || PORT, () => {
                    +  console.log(\`Server listening on port \${PORT}\`);
                });`
  };

const COMMIT_TYPES = {
  fix: '🐛',
  feat: '✨'
} as const;

const generateCommitString = (
  type: keyof typeof COMMIT_TYPES,
  message: string
): string => {
  const cleanMessage = removeConventionalCommitWord(message);
  return config.OCO_EMOJI ? `${COMMIT_TYPES[type]} ${cleanMessage}` : message;
};

const getConsistencyContent = (translation: ConsistencyPrompt) => {
  const fixMessage =
    config.OCO_OMIT_SCOPE && translation.commitFixOmitScope
      ? translation.commitFixOmitScope
      : translation.commitFix;

  const featMessage =
    config.OCO_OMIT_SCOPE && translation.commitFeatOmitScope
      ? translation.commitFeatOmitScope
      : translation.commitFeat;

  const fix = generateCommitString('fix', fixMessage);
  const feat = config.OCO_ONE_LINE_COMMIT
    ? ''
    : generateCommitString('feat', featMessage);

  const description = config.OCO_DESCRIPTION
    ? translation.commitDescription
    : '';

  return [fix, feat, description].filter(Boolean).join('\n');
};

const INIT_CONSISTENCY_PROMPT = (
  translation: ConsistencyPrompt
): OpenAI.Chat.Completions.ChatCompletionMessageParam => ({
  role: 'assistant',
  content: getConsistencyContent(translation)
});

export const getMainCommitPrompt = async (
  fullGitMojiSpec: boolean,
  context: string
): Promise<Array<OpenAI.Chat.Completions.ChatCompletionMessageParam>> => {
  switch (config.OCO_PROMPT_MODULE) {
    case '@commitlint':
      if (!(await utils.commitlintLLMConfigExists())) {
        note(
          `OCO_PROMPT_MODULE 设置为 @commitlint，但你尚未为该项目生成一致性配置。`
        );
        await configureCommitlintIntegration();
      }

      // Replace example prompt with a prompt that's generated by OpenAI for the commitlint config.
      const commitLintConfig = await utils.getCommitlintLLMConfig();

      return [
        commitlintPrompts.INIT_MAIN_PROMPT(
          translation.localLanguage,
          commitLintConfig.prompts
        ),
        INIT_DIFF_PROMPT,
        INIT_CONSISTENCY_PROMPT(
          commitLintConfig.consistency[
            translation.localLanguage
          ] as ConsistencyPrompt
        )
      ];

    default:
      return [
        INIT_MAIN_PROMPT(translation.localLanguage, fullGitMojiSpec, context),
        INIT_DIFF_PROMPT,
        INIT_CONSISTENCY_PROMPT(translation)
      ];
  }
};
