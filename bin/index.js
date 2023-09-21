#!/usr/bin/env node

import { Command } from "commander"

// Define the program description
const program = new Command()
program
    .version("2.0.0")
    .description(
        "A utility for setting aws creds from sso. It can also log you in to ECR"
    )

// Define the command-line argument (required)
program.argument("<profile>", "The sso profile you want to set up creds for")

// Define optional flags with values
program.option(
    "-cp, --customProfile <value>",
    "Save the creds under a different profile"
)
program.option(
    "-e, --ecr [region]",
    "Login to ECR. If region not supplied it will use the default from the profile"
)

// Parse command-line arguments and options
program.parse(process.argv)

// Access the parsed values
const profile = program.args[0]
const options = program.opts()
const customProfile = options.customProfile
const ecr = options.ecr

import SetCreds from "../lib/index.js"

SetCreds(profile, { customProfile, ecr })
