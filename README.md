## ssocred

SSOcred is a handy cli tool that will grab temporary AWS CLI login credentials from AWS SSO and put them in ~/.aws/credentials

Why though? Tools like terraform are currently unable to handle AWS auth via SSO and rely the access key and secret being in the credentials file.

To install: \
`npm install -g aws-sso-credentials-getter` or `yarn global add aws-sso-credentials-getter`

To use: \
`ssocred {profile}`

To set credentials to a custom profilename: \
`ssocred {profile} -c {customProfile}`

For instance when you want a default profile: \
`ssocred {profile} -c default`

You can also set a custom profilename from any current profile that is not expired by running: \
`ssocred {existingProfile} -c {customProfile}`

To also login to ECR: \
`ssocred {profile} -e`

Add you can also login to a different ECR region: \
`ssocred {profile} -e [region]`
