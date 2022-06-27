import { readdirSync, readFileSync, writeFileSync, existsSync } from "fs"
import ini from "ini"
import { homedir } from "os"
import path from "path"
import AWS from "aws-sdk"
import { spawn } from "child_process"

const awsConfigFilePath = path.resolve(homedir(), "./.aws/config")
const awsCredentialsFilePath = path.resolve(homedir(), "./.aws/credentials")
const awsSsoCacheFolderPath = path.resolve(homedir(), "./.aws/sso/cache")

const copyCred = (profiles, creds) => {
    creds[profiles.customProfile] = creds[profiles.profile]
    return writeCreds(creds)
}

const readConfig = () => {
    if(!existsSync(awsConfigFilePath)) {
        return undefined
    }

    return ini.parse(
        readFileSync(awsConfigFilePath, "utf-8")
    )
}

const readCreds = () => {
    if(!existsSync(awsCredentialsFilePath)) {
        return {}
    }

    return ini.parse(
        readFileSync(awsCredentialsFilePath, "utf-8")
    )
}

const writeCreds = (creds) => {
    return writeFileSync(
        awsCredentialsFilePath,
        ini.stringify(creds)
    )
}

const getAccessToken = () => {
    return readdirSync(awsSsoCacheFolderPath).reduce(
        (token, file) => {
            if (token !== null) {
                return token
            }
            const data = JSON.parse(
                readFileSync(
                    path.resolve(awsSsoCacheFolderPath, file),
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

const getConfigForProfile = (config, profile) => {
    let profileConfig = undefined

    const key = "profile " + profile
    if (config === undefined) {
        console.error("Configuration file not found. Please run: aws configure sso")
    } else if (typeof config[key] === "undefined") {
        // TODO: Handle profile=default.
        console.error("Profile not found")
    } else {
        profileConfig = config[key]
    }

    return profileConfig
}

const login = (profile) => {
    return new Promise((res, rej) => {
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
}

export default async (profile, customProfile) => {
    const config = readConfig()
    const profileConfig = getConfigForProfile(config, profile)

    if(profileConfig === undefined) {
        process.exit(1)
    }

    const {
        sso_region,
        sso_account_id: accountId,
        sso_role_name: roleName,
    } = profileConfig

    const creds = readCreds()

    if (creds[profile] === undefined) {
        creds[profile] = {}
    }

    if (
        (typeof creds[profile] !== "undefined" && creds[profile] !== null
            ? creds[profile].expiration
            : void 0) != null
    ) {
        if (
            creds[profile].expiration > Date.now() &&
            typeof customProfile != "undefined"
        ) {
            copyCred({ profile, customProfile }, creds)
            return
        }
    }

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
            creds[profile] = {
                aws_access_key_id: roleCredentials.accessKeyId,
                aws_secret_access_key: roleCredentials.secretAccessKey,
                aws_session_token: roleCredentials.sessionToken,
                expiration: roleCredentials.expiration,
            }

            if (typeof customProfile != "undefined") {
                creds[customProfile] = creds[profile]
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
