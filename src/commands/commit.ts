import {
  text,
  confirm,
  intro,
  isCancel,
  multiselect,
  outro,
  select,
  spinner
} from '@clack/prompts';
import chalk from 'chalk';
import { execa } from 'execa';
import { generateCommitMessageByDiff } from '../generateCommitMessageFromGitDiff';
import {
  assertGitRepo,
  getChangedFiles,
  getDiff,
  getStagedFiles,
  gitAdd
} from '../utils/git';
import { trytm } from '../utils/trytm';
import { getConfig } from './config';

const config = getConfig();

const getGitRemotes = async () => {
  const { stdout } = await execa('git', ['remote']);
  return stdout.split('\n').filter((remote) => Boolean(remote.trim()));
};

// Check for the presence of message templates
const checkMessageTemplate = (extraArgs: string[]): string | false => {
  for (const key in extraArgs) {
    if (extraArgs[key].includes(config.OCO_MESSAGE_TEMPLATE_PLACEHOLDER))
      return extraArgs[key];
  }
  return false;
};

interface GenerateCommitMessageFromGitDiffParams {
  diff: string;
  extraArgs: string[];
  context?: string;
  fullGitMojiSpec?: boolean;
  skipCommitConfirmation?: boolean;
}

const generateCommitMessageFromGitDiff = async ({
  diff,
  extraArgs,
  context = '',
  fullGitMojiSpec = false,
  skipCommitConfirmation = false
}: GenerateCommitMessageFromGitDiffParams): Promise<void> => {
  await assertGitRepo();
  const commitGenerationSpinner = spinner();
  commitGenerationSpinner.start('正在生成 commit message');

  try {
    let commitMessage = await generateCommitMessageByDiff(
      diff,
      fullGitMojiSpec,
      context
    );

    const messageTemplate = checkMessageTemplate(extraArgs);
    if (
      config.OCO_MESSAGE_TEMPLATE_PLACEHOLDER &&
      typeof messageTemplate === 'string'
    ) {
      const messageTemplateIndex = extraArgs.indexOf(messageTemplate);
      extraArgs.splice(messageTemplateIndex, 1);

      commitMessage = messageTemplate.replace(
        config.OCO_MESSAGE_TEMPLATE_PLACEHOLDER,
        commitMessage
      );
    }

    commitGenerationSpinner.stop('📝 提交 message 生成完毕');

    outro(
      `生成的 message:
${chalk.grey('——————————————————')}
${commitMessage}
${chalk.grey('——————————————————')}`
    );

    const userAction = skipCommitConfirmation
      ? 'Yes'
      : await select({
          message: '是否确认提交？',
          options: [
            { value: 'Yes', label: '是' },
            { value: 'No', label: '否' },
            { value: 'Edit', label: '编辑' }
          ]
        });

    if (isCancel(userAction)) process.exit(1);

    if (userAction === 'Edit') {
      const textResponse = await text({
        message: '请编辑提交 message：(直接回车确认)',
        initialValue: commitMessage
      });

      commitMessage = textResponse.toString();
    }

    if (userAction === 'Yes' || userAction === 'Edit') {
      const committingChangesSpinner = spinner();
      committingChangesSpinner.start('正在提交变更');
      const { stdout } = await execa('git', [
        'commit',
        '-m',
        commitMessage,
        ...extraArgs
      ]);
      committingChangesSpinner.stop(`${chalk.green('✔')} 成功提交变更`);

      outro(stdout);

      const remotes = await getGitRemotes();

      // user isn't pushing, return early
      if (config.OCO_GITPUSH === false) return;

      if (!remotes.length) {
        const { stdout } = await execa('git', ['push']);
        if (stdout) outro(stdout);
        process.exit(0);
      }

      if (remotes.length === 1) {
        const isPushConfirmedByUser = await confirm({
          message: '是否确认推送变更到远程仓库？'
        });

        if (isCancel(isPushConfirmedByUser)) process.exit(1);

        if (isPushConfirmedByUser) {
          const pushSpinner = spinner();

          pushSpinner.start(`正在推送变更到 ${remotes[0]}`);

          const { stdout } = await execa('git', [
            'push',
            '--verbose',
            remotes[0]
          ]);

          pushSpinner.stop(`${chalk.green('✔')} 成功推送变更到 ${remotes[0]}`);

          if (stdout) outro(stdout);
        } else {
          outro('`git push` 已取消');
          process.exit(0);
        }
      } else {
        const skipOption = `不推送`;
        const selectedRemote = (await select({
          message: '请选择要推送的远程仓库',
          options: [...remotes, skipOption].map((remote) => ({
            value: remote,
            label: remote
          }))
        })) as string;

        if (isCancel(selectedRemote)) process.exit(1);

        if (selectedRemote !== skipOption) {
          const pushSpinner = spinner();

          pushSpinner.start(`正在推送变更到 ${selectedRemote}`);

          const { stdout } = await execa('git', ['push', selectedRemote]);

          if (stdout) outro(stdout);

          pushSpinner.stop(
            `${chalk.green('✔')} 成功推送变更到 ${selectedRemote}`
          );
        }
      }
    } else {
      const regenerateMessage = await confirm({
        message: '是否重新生成提交 message？'
      });

      if (isCancel(regenerateMessage)) process.exit(1);

      if (regenerateMessage) {
        await generateCommitMessageFromGitDiff({
          diff,
          extraArgs,
          fullGitMojiSpec
        });
      }
    }
  } catch (error) {
    commitGenerationSpinner.stop(`${chalk.red('✖')} 生成提交 message 失败`);

    console.log(error);

    const err = error as Error;
    outro(`${chalk.red('✖')} ${err?.message || err}`);
    process.exit(1);
  }
};

export async function commit(
  extraArgs: string[] = [],
  context: string = '',
  isStageAllFlag: Boolean = false,
  fullGitMojiSpec: boolean = false,
  skipCommitConfirmation: boolean = false
) {
  if (isStageAllFlag) {
    const changedFiles = await getChangedFiles();

    if (changedFiles) await gitAdd({ files: changedFiles });
    else {
      outro('未检测到变更，编写代码后再次运行 `oco`');
      process.exit(1);
    }
  }

  const [stagedFiles, errorStagedFiles] = await trytm(getStagedFiles());
  const [changedFiles, errorChangedFiles] = await trytm(getChangedFiles());

  if (!changedFiles?.length && !stagedFiles?.length) {
    outro(chalk.red('未检测到变更'));
    process.exit(1);
  }

  intro('AI 自动生成 Git 提交信息');
  if (errorChangedFiles ?? errorStagedFiles) {
    outro(`${chalk.red('✖')} ${errorChangedFiles ?? errorStagedFiles}`);
    process.exit(1);
  }

  const stagedFilesSpinner = spinner();

  stagedFilesSpinner.start('正在统计已暂存文件');

  if (stagedFiles.length === 0) {
    stagedFilesSpinner.stop('未检测到已暂存文件，将自动暂存所有文件');
    // outro('未检测到已暂存文件，将自动暂存所有文件');

    const isStageAllAndCommitConfirmedByUser = true;
    // const isStageAllAndCommitConfirmedByUser = await confirm({
    //   message: '是否暂存所有文件并生成提交 message？'
    // });

    if (isCancel(isStageAllAndCommitConfirmedByUser)) process.exit(1);

    if (isStageAllAndCommitConfirmedByUser) {
      await commit(extraArgs, context, true, fullGitMojiSpec);
      process.exit(0);
    }

    if (stagedFiles.length === 0 && changedFiles.length > 0) {
      const files = (await multiselect({
        message: chalk.cyan('请选择要添加到提交中的文件：'),
        options: changedFiles.map((file) => ({
          value: file,
          label: file
        }))
      })) as string[];

      if (isCancel(files)) process.exit(0);

      await gitAdd({ files });
    }

    await commit(extraArgs, context, false, fullGitMojiSpec);
    process.exit(0);
  }

  stagedFilesSpinner.stop(
    `${stagedFiles.length} staged files:\n${stagedFiles
      .map((file) => `  ${file}`)
      .join('\n')}`
  );

  const [, generateCommitError] = await trytm(
    generateCommitMessageFromGitDiff({
      diff: await getDiff({ files: stagedFiles }),
      extraArgs,
      context,
      fullGitMojiSpec,
      skipCommitConfirmation
    })
  );

  if (generateCommitError) {
    outro(`${chalk.red('✖')} ${generateCommitError}`);
    process.exit(1);
  }

  process.exit(0);
}
