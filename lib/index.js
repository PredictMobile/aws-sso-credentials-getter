import { readdirSync, readFileSync, writeFileSync } from "fs"
import ini from "ini"
import { homedir } from "os"
import path from "path"
import AWS from "aws-sdk"
import { spawn } from "child_process"

const readConfig = () => {
    return ini.parse(
        readFileSync(path.resolve(homedir(), "./.aws/config"), "utf-8")
    )
}

const readCreds = () => {
    return ini.parse(
        readFileSync(path.resolve(homedir(), "./.aws/credentials"), "utf-8")
    )
}

const writeCreds = (creds) => {
    return writeFileSync(
        path.resolve(homedir(), "./.aws/credentials"),
        ini.stringify(creds)
    )
}

const getAccessToken = () => {
    return readdirSync(path.resolve(homedir(), "./.aws/sso/cache")).reduce(
        (token, file) => {
            if (token !== null) {
                return token
            }
            const data = JSON.parse(
                readFileSync(
                    path.resolve(homedir(), "./.aws/sso/cache", file),
                    "utf-8"
                )
            )
            const date = new Date(data.expiresAt.replace(/UTC/gm, `Z`))
            if (
                date > new Date() &&
                typeof data.accessToken === "string" &&
                data.accessToken !== ""
            ) {
                return data.accessToken
            }
            return token
        },
        null
    )
}

const getCredentials = (sso, params) => {
    return sso.getRoleCredentials(params).promise()
}

export default async (profile, customProfile) => {
    const key = "profile " + profile
    const config = readConfig()
    if (typeof config[key] === "undefined") {
        console.error("Profile not found")
        process.exit(1)
    }

    const creds = readCreds()

    if (
        (typeof creds[profile] !== "undefined" && creds[profile] !== null
            ? creds[profile].expiration
            : void 0) != null
    ) {
        return creds[profile].expiration > Date.now()
    }

    const login = (profile) =>
        new Promise((res, rej) => {
            console.log("Trying to log you in")
            const child = spawn("aws", ["sso", "login", "--profile", profile])

            child.stdout.on("data", (data) => {
                console.log(`\n${data}`)
            })

            child.stderr.on("data", (data) => {
                console.error(`ERROR: ${data}`)
            })

            child.on("error", (error) => {
                console.error(`ERROR: ${error.message}`)
            })

            child.on("close", () => {
                return res()
            })
        })

    const {
        sso_region,
        sso_account_id: accountId,
        sso_role_name: roleName,
    } = config[key]

    let accessToken = getAccessToken()

    if (accessToken === null) {
        await login(profile)
        accessToken = getAccessToken()
    }

    AWS.config.region = sso_region

    const sso = new AWS.SSO()

    const params = {
        accessToken,
        accountId,
        roleName,
    }

    return getCredentials(sso, params)
        .then(({ roleCredentials }) => {
            if (typeof customProfile != "undefined") {
                creds[customProfile] = {
                    aws_access_key_id: roleCredentials.accessKeyId,
                    aws_secret_access_key: roleCredentials.secretAccessKey,
                    aws_session_token: roleCredentials.sessionToken,
                    expiration: roleCredentials.expiration,
                }
            }
            creds[profile] = {
                aws_access_key_id: roleCredentials.accessKeyId,
                aws_secret_access_key: roleCredentials.secretAccessKey,
                aws_session_token: roleCredentials.sessionToken,
                expiration: roleCredentials.expiration,
            }

            return writeCreds(creds)
        })
        .catch((e) => {
            console.error("Something went wrong")
            console.error(e)
            console.error("Please login to SSO manually")
            console.error("aws sso login --profile " + profile)

            process.exit(1)
        })
}
