const core = require('@actions/core');
const exec = require('@actions/exec');
const process = require('process');
const utils = require('./utils');

async function run() {
    try {
        if (process.env["GITHUB_ACTIONS"]) {
            // console.log("Running inside a github action");
        }
        // To test this from your dev box, use "env INPUT_GOMODS='<test_pattern>' node index.js"
        const filePatterns = core
              .getInput('gomods')
              .split("\n")
              .map(s => s.trim())
              .filter(s => s !== "");
        const directives = core
              .getInput('directives')
              .split("\n")
              .map(s => s.trim())
              .filter(s => s !== "");
        const rmGoSum = core.getInput('remove_gosum').toLowerCase();
        let dirs = await utils.findDirectories(filePatterns);

        if (rmGoSum) {
            await removeGoSum(dirs)
        }

        if (directives && directives.length > 0) {
            for (const directive of directives) {
                await gomodTidy(dirs, directive)
            }
        } else {
            await gomodTidy(dirs, false);
        }

        let diffs = await gitDiffFiles();

        core.startGroup('Diff Files');
        for (const f of diffs) {
            console.log(`  ${f}`);
        }
        core.endGroup();
        core.startGroup('Full diff');
        await exec.exec('git', ['diff']);
        core.endGroup();

        const gosum_only = core.getInput('gosum_only').toLowerCase();
        const gomodsum_only = core.getInput('gomodsum_only').toLowerCase();
        let enabled = (s) => { return s === 'true' || s === 'enabled'; };
        utils.checkModifiedFiles(diffs, enabled(gosum_only), enabled(gomodsum_only));
        core.setOutput('changedfiles', diffs.join("\n"));
    } catch (error) {
        core.setFailed(error.message);
    }
}

run();

async function removeGoSum(dirs) {
    let p = [];
    for (const d of dirs) {
        core.debug(`${d}: rm go.sum`);
        p.push(exec.exec('rm', ['go.sum'], { cwd: d, silent: false }));
    }
    return await Promise.all(p);
}

async function gomodTidy(dirs, directive) {
    for (const d of dirs) {
        if (directive !== false) {
            core.debug(`${d}: go mod tidy -go=${directive}`);
            await exec.exec('go', ['mod', 'tidy', '-go='+directive], { cwd: d, silent: false });
        } else {
            core.debug(`${d}: go mod tidy`);
            await exec.exec('go', ['mod', 'tidy'], { cwd: d, silent: false });
        }
    }
}

// Run git status in each directory - to see what files have changed
// \todo check behaviour with git submodules
async function gitDiffFiles() {
    core.debug(`git diff --name-only`);
    let myOutput = '';
    const options = {
        silent: true,
        listeners: {
            stdout: data => {
                myOutput += data.toString();
            }
        }
    };
    await exec.exec('git', ['diff', '--name-only'], options);
    // break up the filenames in output by line
    const diffs = myOutput.split("\n").filter(x => x.trim());
    core.debug(`diffs=${diffs}`);
    return diffs;
}
