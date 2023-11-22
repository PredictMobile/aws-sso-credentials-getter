import { readdirSync, readFileSync, writeFileSync, existsSync } from "fs"
import ini from "ini"
import { homedir } from "os"
import path from "path"
import { SSO } from "@aws-sdk/client-sso"
import { spawn } from "child_process"

const awsConfigFilePath = path.resolve(homedir(), "./.aws/config")
const awsCredentialsFilePath = path.resolve(homedir(), "./.aws/credentials")
const awsSsoCacheFolderPath = path.resolve(homedir(), "./.aws/sso/cache")

const copyCred = (profiles, creds) => {
    creds[profiles.customProfile] = creds[profiles.profile]
    return writeCreds(creds)
}

const readConfig = () => {
    if (!existsSync(awsConfigFilePath)) {
        return undefined
    }

    return ini.parse(readFileSync(awsConfigFilePath, "utf-8"))
}

const readCreds = () => {
    if (!existsSync(awsCredentialsFilePath)) {
        return {}
    }

    return ini.parse(readFileSync(awsCredentialsFilePath, "utf-8"))
}

const writeCreds = (creds) => {
    return writeFileSync(awsCredentialsFilePath, ini.stringify(creds))
}

const getAccessToken = () => {
    try {
        return readdirSync(awsSsoCacheFolderPath).reduce((token, file) => {
            if (token !== null) {
                return token
            }
            const data = JSON.parse(
                readFileSync(path.resolve(awsSsoCacheFolderPath, file), "utf-8")
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
        }, null)
    } catch (e) {
        return null
    }
}

const getCredentials = (sso, params) => {
    return sso.getRoleCredentials(params)
}

const getConfigForProfile = (config, profile) => {
    let key = "profile " + profile
    if (config === undefined) {
        console.error(
            "Configuration file not found. Please run: aws configure sso"
        )
        return undefined
    }

    if (typeof config[key] === "undefined") {
        if (profile === "default" && typeof config["default"] !== "undefined") {
            key = "default"
        } else {
            console.error("Profile not found")
            return undefined
        }
    }

    const profileConfig = config[key]

    if (
        typeof profileConfig.sso_region === "undefined" ||
        typeof profileConfig.sso_account_id === "undefined" ||
        typeof profileConfig.sso_role_name === "undefined"
    ) {
        console.error(`The profile '${profile}' is not a valid SSO profile.`)
        console.error("A valid SSO profile must contain the following fields:")
        console.error("\tsso_region")
        console.error("\tsso_account_id")
        console.error("\tsso_role_name")

        return undefined
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
            rej(error)
        })

        child.on("close", (code) => {
            if (code === 0) {
                return res()
            }

            rej(new Error(`Login ended with code: ${code}`))
        })
    })
}

const loginECR = async (authorizationData) => {
    return new Promise((res, rej) => {
        console.log("Trying to log you into ECR")
        let text = atob(authorizationData.authorizationToken)
        const [username, password] = text.split(":")
        const child = spawn("docker", [
            "login",
            "--username",
            username,
            "--password-stdin",
            authorizationData.proxyEndpoint,
        ])
        child.stdin.write(password)
        child.stdin.end()

        child.stdout.on("data", (data) => {
            console.log(`\n${data}`)
        })

        child.stderr.on("data", (data) => {
            console.error(`ERROR: ${data}`)
        })

        child.on("error", (error) => {
            console.error(`ERROR: ${error.message}`)
            rej(error)
        })

        child.on("close", (code) => {
            if (code === 0) {
                return res()
            }

            rej(new Error(`Login ended with code: ${code}`))
        })
    })
}

export default async (profile, { customProfile, ecr }) => {
    try {
        const config = readConfig()
        const profileConfig = getConfigForProfile(config, profile)

        if (profileConfig === undefined) {
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

        const sso = new SSO({ region: sso_region })

        const params = {
            accessToken,
            accountId,
            roleName,
        }

        const { roleCredentials } = await getCredentials(sso, params)

        creds[profile] = {
            aws_access_key_id: roleCredentials.accessKeyId,
            aws_secret_access_key: roleCredentials.secretAccessKey,
            aws_session_token: roleCredentials.sessionToken,
            expiration: roleCredentials.expiration,
        }

        if (typeof customProfile != "undefined") {
            creds[customProfile] = creds[profile]
        }

        writeCreds(creds)

        if (ecr) {
            let region = sso_region
            if (typeof ecr === "string") {
                region = ecr
            }
            const awsEcr = new AWS.ECR({ region, credentials: roleCredentials })
            const { authorizationData } = await awsEcr
                .getAuthorizationToken()
                .promise()
            loginECR(authorizationData[0])
        }
    } catch (e) {
        console.error("Something went wrong")
        console.error(e)
        console.error("Please login to SSO manually")
        console.error("aws sso login --profile " + profile)

        process.exit(1)
    }
}
