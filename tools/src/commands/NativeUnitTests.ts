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
        // make schemes shared

        const xcodeprojFiles = fs.readdirSync(
          path.join(Directories.getIosDir(), 'Pods', `${pkg.podspecName}.xcodeproj`)
        );
        console.log('xcodeprojFiles directories:', pkg.podspecName, JSON.stringify(xcodeprojFiles));
        const xcuserdataFiles = fs.readdirSync(
          path.join(Directories.getIosDir(), 'Pods', `${pkg.podspecName}.xcodeproj`, 'xcuserdata')
        );
        console.log('xcuserdata directories:', pkg.podspecName, JSON.stringify(xcuserdataFiles));
        const xcschemesFiles = fs.readdirSync(
          path.join(
            Directories.getIosDir(),
            'Pods',
            `${pkg.podspecName}.xcodeproj`,
            'xcuserdata',
            xcuserdataFiles[0],
            'xcschemes'
          )
        );
        console.log('xcschemes files:', pkg.podspecName, JSON.stringify(xcschemesFiles));

        // await spawnAsync('fastlane', ['test', `scheme:${pkg.podspecName}`], {
        //   cwd: Directories.getExpoRepositoryRootDir(),
        //   stdio: 'inherit',
        // });
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
