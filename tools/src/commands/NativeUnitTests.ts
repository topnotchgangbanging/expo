import spawnAsync from '@expo/spawn-async';
import chalk from 'chalk';
import fs from 'fs-extra';
import inquirer from 'inquirer';
import path from 'path';

import * as Directories from '../Directories';
import * as Packages from '../Packages';
import { androidNativeUnitTests } from './AndroidNativeUnitTests';

type PlatformName = 'android' | 'ios' | 'both';
type TestType = 'local' | 'instrumented';

async function thisAction({
  platform,
  type = 'local',
}: {
  platform?: PlatformName;
  type: TestType;
}) {
  if (!platform) {
    console.log(chalk.yellow("You haven't specified platform to run unit tests for!"));
    const result = await inquirer.prompt<{ platform: PlatformName }>([
      {
        name: 'platform',
        type: 'list',
        message: 'Which platform do you want to run native tests ?',
        choices: ['android', 'ios', 'both'],
        default: 'android',
      },
    ]);
    platform = result.platform;
  }
  const runAndroid = platform === 'android' || platform === 'both';
  const runIos = platform === 'ios' || platform === 'both';
  if (runIos) {
    const packages = await Packages.getListOfPackagesAsync();
    let errors: any[] = [];
    for (const pkg of packages) {
      if (
        pkg.podspecName !== 'EXSharing' &&
        (!pkg.isSupportedOnPlatform('ios') ||
          !(await pkg.hasNativeTestsAsync('ios')) ||
          !pkg.podspecName)
      ) {
        continue;
      }
      try {
        // make schemes shared by moving them from xcodeproj/xcuserdata/runner.xcuserdatad/xcschemes
        // to xcodeproj/xcshareddata/xcschemes
        // otherwise fastlane will default to the Exponent scheme
        const xcodeprojDir = path.join(
          Directories.getIosDir(),
          'Pods',
          `${pkg.podspecName}.xcodeproj`
        );
        const destinationDir = path.join(xcodeprojDir, 'xcshareddata', 'xcschemes');
        await fs.mkdirp(destinationDir);

        // find user directory name, should be runner.xcuserdatad but depends on the OS username
        const xcuserdataDirName = await fs.readdir(path.join(xcodeprojDir, 'xcuserdata'))[0];

        const xcschemesDir = path.join(xcodeprojDir, 'xcuserdata', xcuserdataDirName, 'xcschemes');
        const xcschemesFiles = (await fs.readdir(xcschemesDir)).filter((file) =>
          file.endsWith('.xcscheme')
        );
        if (!xcschemesFiles.length) {
          throw new Error(`No scheme could be found to run tests for ${pkg.podspecName}`);
        }
        for (const file of xcschemesFiles) {
          await fs.move(path.join(xcschemesDir, file), path.join(destinationDir, file));
        }

        await spawnAsync('fastlane', ['test', `scheme:${pkg.podspecName}`], {
          cwd: Directories.getExpoRepositoryRootDir(),
          stdio: 'inherit',
        });
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      console.error('One or more iOS unit tests failed:');
      for (const error of errors) {
        console.error('stdout >', error.stdout);
        console.error('stderr >', error.stderr);
      }
      throw new Error('Unit tests failed');
    } else {
      console.log('All unit tests passed!');
    }
  }

  if (runAndroid) {
    await androidNativeUnitTests({ type });
  }
}

export default (program: any) => {
  program
    .command('native-unit-tests')
    .option(
      '-p, --platform <string>',
      'Determine for which platform we should run native tests: android, ios or both'
    )
    .option(
      '-t, --type <string>',
      'Type of unit test to run, if supported by this platform. local (default) or instrumented'
    )
    .description('Runs native unit tests for each unimodules that provides them.')
    .asyncAction(thisAction);
};
