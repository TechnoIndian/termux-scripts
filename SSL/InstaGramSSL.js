/*
 InstaGram SSL Bypass
*/

console.log("\n[+] InstaGram SSL Bypass Loaded\n");
console.log("[+] Arch:", Process.arch);

// Custom params
const MODE = {
    FBCertificateVerifier: true,
    NetworkSecurityTrustManager: true
}

// load Java Library
const loadJava = (name) => {
    try {
        const myClass = Java.use(name);
        console.log("[+] Class:", name);
        return myClass;
    } catch(e) {
        console.log("[✘] Error loading:", name, "-", e.message);
        return null;
    }
};

// load Binary ( https://codeshare.frida.re/@Eltion/instagram-ssl-pinning-bypass/ )
function waitForModules(moduleName) {
    return new Promise(resolve => {
        const interval = setInterval(() => {
            const module = Process.findModuleByName(moduleName);
            if (module != null) {
                console.log("[+] Module:", moduleName);
                console.log("[+] Path:", module.path);
                clearInterval(interval);
                resolve(module);
            }
        }, 300);
    });
}


// hook proxygen SSLVerification
function hook_proxygen_SSLVerification(library) {

    const functionName = "verifyWithMetrics"

    try {
    
        if (!library) {
            console.log("[!] Library not found:", library);
            return;
        }

        // Find by export
        var target = library.enumerateExports().find(
            exports => exports.name.includes(functionName)
        );

        if (!target) {
            console.log(`[✘] ${functionName} not found\n`);
            return;
        }

        console.log("[+] Found:", target.name);
        console.log("[+] Address:", target.address);

        Interceptor.attach(target.address, {
            onLeave: retvalue => retvalue.replace(ptr(1))
        });

        console.log(`[✓] Patched: ${functionName}\n`);

    } catch (e) {
        console.log("[✘] Error in proxygen SSLVerification:", e.message);
    }
}


/* /data/data/{packageName}/lib-compressed/*.so */
waitForModules("libscrollmerged.so").then((lib) => {
    hook_proxygen_SSLVerification(lib);
});


setTimeout(function() {

    console.log("\n--- Meta Bypass Loaded ---\n");

    if (Java.available) {
        console.log("[*] Java available");
        Java.perform(function() {

            // https://github.com/logosred/murder-meta-bypass
            // Simple script to bypass SSL pinning in Instagram.
            if (MODE.FBCertificateVerifier) {

                const CertificateVerifier = loadJava("com.facebook.mobilenetwork.internal.certificateverifier.CertificateVerifier");

                if (CertificateVerifier) {

                    // verify() may delegate to verifyWithProofOfPossession() (primary) or remain unused in modern Meta apps
                    try {
                        CertificateVerifier.verify.overload(
                            '[Ljava.security.cert.X509Certificate;',
                            'java.lang.String',
                            'boolean'
                        ).implementation = function(certChain, hostname, someBoolean) {
                            console.log(`[✓] Bypassed CertificateVerifier.verify(certChain, "${hostname}", ${someBoolean})`);
                        };
                        console.log("[✓] CertificateVerifier [verify] hook applied");
                    } catch (e) {
                        console.log(`[✘] CertificateVerifier [verify] ${e}`);
                    }

                    // verifyWithProofOfPossession
                    try {
                        CertificateVerifier.verifyWithProofOfPossession.overload(
                            '[[B',
                            'java.lang.String',
                            'boolean',
                            'int',
                            '[B',
                            '[B'
                        ).implementation = function(certBytes, hostname, flag, intVal, arr1, arr2) {
                            console.log(`[✓] Bypassed verifyWithProofOfPossession ➢ ${hostname}`);
                        };
                        console.log("[✓] CertificateVerifier [verifyWithProofOfPossession] hook applied");
                    } catch (e) {
                        console.log(`[✘] CertificateVerifier [verifyWithProofOfPossession] ${e}`);
                    }
                }
            }

            // https://android.googlesource.com/platform/frameworks/base/+/master/core/java/android/security/net/config/NetworkSecurityTrustManager.java
            if (MODE.NetworkSecurityTrustManager) {

                const NSTrustManager = loadJava("android.security.net.config.NetworkSecurityTrustManager");

                if (NSTrustManager) {
                    try {
                        NSTrustManager.isPinningEnforced.overload("java.util.List").implementation = function (chain) {
                            console.log("[✓] Bypassed isPinningEnforced");
                            return false;
                        };
                        console.log("[✓] NetworkSecurityTrustManager [isPinningEnforced] hook applied");
                    } catch (e) {
                        console.log(`[✘] NetworkSecurityTrustManager [isPinningEnforced] ${e}`);
                    }
                }
            }
        });
    } else {
        console.log("[!] Java unavailable");
    }
    console.log("\n---- Capturing setup completed ----\n");
}, 0);
