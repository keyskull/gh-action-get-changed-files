// External Dependencies
const fs = require('fs');
const github = require('@actions/github');
const core = require('@actions/core');
const metadata = require('./metadata')

require('dotenv').config();

const context = github.context;
const repo = context.payload.repository;
const owner = repo.owner;

const FILES = new Set();
const FILES_ADDED = new Set();
const FILES_MODIFIED = new Set();
const FILES_REMOVED = new Set();
const FILES_RENAMED = new Array();
const FILES_DETAIL = {
	"timestamp": Date.now(),
	"status": {
		"added": new Array(),
		"modified": new Array(),
		"removed": new Array(),
		"renamed": new Array()
	}
};
var GIT_INFO = "";

const gh = github.getOctokit(core.getInput('token'));
// const gh = github.getOctokit(process.env.TOKEN);
const args = { owner: owner.name || owner.login, repo: repo.name };
// const args = { owner: process.env.OWNER, repo: process.env.REPO, commit_sha: process.env.COMMIT_SHA};

function debug(msg, obj = null) {
	core.debug(formatLogMessage(msg, obj));
}

function fetchCommitData(commit) {
	args.ref = commit.id || commit.sha;

	debug('Calling gh.repos.getCommit() with args', args)

	
	GIT_INFO =args.ref;

	return gh.repos.getCommit(args);
}

function formatLogMessage(msg, obj = null) {
	return obj ? `${msg}: ${toJSON(obj)}` : msg;
}

async function getCommits() {
	let commits;

	debug('Getting commits...');

	switch (context.eventName) {
		case 'push':
			commits = context.payload.commits;
			break;

		case 'pull_request':
			const url = context.payload.pull_request.commits_url;

			commits = await gh.paginate(`GET ${url}`, args);
			break;

		default:
			info('You are using this action on an event for which it has not been tested. Only the "push" and "pull_request" events are officially supported.');

			commits = [];
			break;
	}

	return commits;
}

function info(msg, obj = null) {
	core.info(formatLogMessage(msg, obj));
}

function isAdded(file) {
	return 'added' === file.status;
}

function isModified(file) {
	return 'modified' === file.status;
}

function isRemoved(file) {
	return 'removed' === file.status;
}

function isRenamed(file) {
	return 'renamed' === file.status;
}

async function outputResults() {
	debug('FILES', Array.from(FILES.values()));

	var data = await metadata.generateMetaData(FILES_DETAIL, 'https://raw.githubusercontent.com/' + args.owner + '/' + args.repo + '/metadata/metadata.json');
	data['commit'] = GIT_INFO;

	core.setOutput('all', toJSON(Array.from(FILES.values()), 0));
	core.setOutput('detail', toJSON(FILES_DETAIL));
	core.setOutput('added', toJSON(Array.from(FILES_ADDED.values()), 0));
	core.setOutput('modified', toJSON(Array.from(FILES_MODIFIED.values()), 0));
	core.setOutput('removed', toJSON(Array.from(FILES_REMOVED.values()), 0));
	core.setOutput('renamed', toJSON(Array.from(FILES_RENAMED.values()), 0));
	core.setOutput('metadata', toJSON(data));
	core.setOutput('commit', GIT_INFO);

	fs.writeFileSync(`${process.env.HOME}/files.json`, toJSON(Array.from(FILES.values())), 'utf-8');
	fs.writeFileSync(`${process.env.HOME}/files_detail.json`, toJSON(FILES_DETAIL), 'utf-8');
	fs.writeFileSync(`${process.env.HOME}/files_added.json`, toJSON(Array.from(FILES_ADDED.values())), 'utf-8');
	fs.writeFileSync(`${process.env.HOME}/files_modified.json`, toJSON(Array.from(FILES_MODIFIED.values())), 'utf-8');
	fs.writeFileSync(`${process.env.HOME}/files_removed.json`, toJSON(Array.from(FILES_REMOVED.values())), 'utf-8');
	fs.writeFileSync(`${process.env.HOME}/files_renamed.json`, toJSON(Array.from(FILES_RENAMED.values())), 'utf-8');
	fs.writeFileSync(`${process.env.HOME}/metadata.json`, toJSON(data), 'utf-8');
	fs.writeFileSync(`${process.env.HOME}/commit`, GIT_INFO, 'utf-8');

	// Backwards Compatability
	core.setOutput('deleted', toJSON(Array.from(FILES_REMOVED.values()), 0));
	fs.writeFileSync(`${process.env.HOME}/files_deleted.json`, toJSON(Array.from(FILES_REMOVED.values())), 'utf-8');


}

async function processCommitData(result) {
	debug('Processing API Response', result);

	if (!result || !result.data) {
		return;
	}


	result.data.files.forEach(file => {
		debug('File:', file);

		(isAdded(file) || isModified(file) || isRenamed(file)) && FILES.add(file.filename);

		if (isAdded(file)) {
			FILES_ADDED.add(file.filename);
			FILES_REMOVED.delete(file.filename);

			return; // continue
		}

		if (isRemoved(file)) {
			if (!FILES_ADDED.has(file.filename)) {
				FILES_REMOVED.add(file.filename);
			}

			FILES_ADDED.delete(file.filename);
			FILES_MODIFIED.delete(file.filename);

			return; // continue;
		}

		if (isModified(file)) {
			FILES_MODIFIED.add(file.filename);

			return; // continue;
		}

		if (isRenamed(file)) {
			processRenamedFile(file.previous_filename, file.filename);
		}
	});

	FILES_DETAIL["status"]['added'] = Array.from(FILES_ADDED.values());
	FILES_DETAIL["status"]['modified'] =Array.from(FILES_MODIFIED.values());
	FILES_DETAIL["status"]['removed'] = Array.from(FILES_REMOVED.values());
	FILES_DETAIL["status"]['renamed']= FILES_RENAMED;

}

function processRenamedFile(prev_file, new_file) {
	FILES.delete(prev_file) && FILES.add(new_file);
	FILES_ADDED.delete(prev_file) && FILES_ADDED.add(new_file);
	FILES_MODIFIED.delete(prev_file) && FILES_MODIFIED.add(new_file);
	FILES_RENAMED.push({ file: { filename: new_file, previous_filename: prev_file }});
}

function toJSON(value, pretty = true) {
	return pretty
		? JSON.stringify(value, null, 4)
		: JSON.stringify(value);
}


debug('context', context);
debug('args', args);

// getCommits()
// test //gh.paginate(`GET /repos/{owner}/{repo}/commits/{commit_sha}`, args)

getCommits().then(commits => {
// gh.paginate(`GET /repos/{owner}/{repo}/commits/{commit_sha}`, args).then(commits => {
	// Exclude merge commits

	commits = commits.filter(c => !c.parents || 1 === c.parents.length);

	if ('push' === context.eventName) {
		commits = commits.filter(c => c.distinct);
	}

	debug('All Commits', commits);

	Promise.all(commits.map(fetchCommitData))
		.then(data => Promise.all(data.map(processCommitData)))
		.then(outputResults)
		.then(() => process.exitCode = 0)
		.catch(err => core.error(err) && (process.exitCode = 1));
});

