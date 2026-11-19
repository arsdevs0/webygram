Latest browser voice update

Use the contents of github-upload-browser-voice.zip (or the matching export folder).
Copy those updated files into your existing cloned GitHub repository, keeping its .git folder.
Open a terminal inside that repository and run:

    git add .
    git commit -m "Add lightweight local AI voice and recording fixes"
    git push

This workspace is not a Git repository, so no push was performed here.
The commands above use your repository's existing branch and remote.
Vercel should use npm run build:web with dist as the output directory.

AI Woman runs locally using LLVC. The optional model/runtime downloads only when
selected; it does not need a Python server or GPU. Slow devices use clearly labelled
lightweight effects. A physical phone and live Telegram account still need testing.
