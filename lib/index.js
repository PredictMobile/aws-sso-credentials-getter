import { readFileSync, writeFileSync, readdirSync } from 'fs';
import ini from 'ini';
import { homedir } from 'os';
import path from 'path';
import AWS from 'aws-sdk';

const readConfig = () => {
    return ini.parse(readFileSync(path.resolve(homedir(), './.aws/config'), 'utf-8'));
}

const readCreds = () => {
    return ini.parse(readFileSync(path.resolve(homedir(), './.aws/credentials'), 'utf-8'));
}

const writeCreds = (creds) => {
    return writeFileSync(path.resolve(homedir(), './.aws/credentials'), ini.stringify(creds));
}

const getAccessToken = () => {
    return readdirSync(path.resolve(homedir(), './.aws/sso/cache'))
        .reduce(
            (token, file) => {
                if (token !== '') {
                    return token;
                }
                const data = JSON.parse(readFileSync(path.resolve(homedir(), './.aws/sso/cache', file), 'utf-8'));
                if (typeof data.accessToken === 'string' && data.accessToken !== '') {
                    return data.accessToken;
                }
                return token;
            },
            ''
        );
}

const getTempCreds = () => { }

export default (profile) => {
    const key = "profile " + profile;
    const config = readConfig();
    if (typeof config[key] === "undefined") {
        return console.error('Profile not found');
    }

    const {
        sso_region,
        sso_account_id: accountId,
        sso_role_name: roleName,
    } = config[key];

    const creds = readCreds();

    const accessToken = getAccessToken();

    if (accessToken === "") {
        return console.error('Please login to SSO');
    }

    AWS.config.region = sso_region;

    const sso = new AWS.SSO();

    var params = {
        accessToken,
        accountId,
        roleName
    };

    const getTempCreds = sso.getRoleCredentials(params).promise();

    getTempCreds.then((tmpCreds) => {
        creds[key] = {
            aws_access_key_id: tmpCreds.roleCredentials.accessKeyId,
            aws_secret_access_key: tmpCreds.roleCredentials.secretAccessKey,
            aws_session_token: tmpCreds.roleCredentials.sessionToken
        }

        return writeCreds(creds);
    });
};