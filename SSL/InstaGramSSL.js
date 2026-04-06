/*
 InstaGram SSL Bypass
*/

console.log("\n[+] InstaGram SSL Bypass Loaded\n");
console.log("[+] Arch:", Process.arch);

// Custom params
const MODE = {
    FBCertificateVerifier: true,
    NetworkSecurityTrustManager: true,
    ConscryptTrustManagerImpl: true,
    SSLContext: true
}

// load Java Library
const loadJava = (library) => {
    try {
        return Java.use(library);
    } catch (e) {
        return undefined;
    }
}

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


setTimeout(function () {

    console.log("\n--- Meta Bypass Loaded ---\n");

    if (Java.available) {

        console.log("\n[*] Java available\n");

        Java.perform(function () {

            // https://github.com/logosred/murder-meta-bypass
            // Simple script to bypass SSL pinning in Instagram.
            if (MODE.FBCertificateVerifier) {

                console.log("\n[+] Facebook Custom CertificateVerifier\n");

                const CertificateVerifier = loadJava("com.facebook.mobilenetwork.internal.certificateverifier.CertificateVerifier");

                // Bypass CertificateVerifier.verify
                try {
                    CertificateVerifier.verify.overload(
                        "[Ljava.security.cert.X509Certificate;",
                        "java.lang.String",
                        "boolean"
                    ).implementation = function (certChain, hostname, someBoolean) {
                        console.log(`[✓] Bypassed CertificateVerifier.verify(certChain, "${hostname}", ${someBoolean})`);
                    };
                } catch (e) {
                    console.log("[✘] CertificateVerifier [verify] not found");
                }

                // Bypass CertificateVerifier.verifyWithProofOfPossession
                try {
                    CertificateVerifier.verifyWithProofOfPossession.overload(
                        "[[B",
                        "java.lang.String",
                        "boolean",
                        "int",
                        "[B",
                        "[B"
                    ).implementation = function (certBytes, hostname, flag, intVal, arr1, arr2) {
                        console.log(`[✓] Bypassed verifyWithProofOfPossession ➢ ${hostname}`);
                    };
                } catch (e) {
                      console.log("[✘] CertificateVerifier [verifyWithProofOfPossession] not found");
                }
            }


            // NetworkSecurityTrustManager ( https://android.googlesource.com/platform/frameworks/base/+/master/core/java/android/security/net/config/NetworkSecurityTrustManager.java ) //
            if (MODE.NetworkSecurityTrustManager) {

                console.log("\n[+] NetworkSecurityTrustManager\n");

                try {
                    const NSTrustManager = Java.use("android.security.net.config.NetworkSecurityTrustManager");

                    NSTrustManager.isPinningEnforced.overload("java.util.List").implementation = function (chain) {
                        console.log("[✓] Bypassed isPinningEnforced");
                        return false;
                    };
                } catch (e) {
                    console.log("[✘] NetworkSecurityTrustManager [isPinningEnforced] not found");
                }
            }


            // TrustManager (Android < 7) //
            if (MODE.SSLContext) {

                console.log("\n[+] X509TrustManager [SSLContext]\n");

                try {
                    const X509TrustManager = Java.use("javax.net.ssl.X509TrustManager");
                    const SSLContext = Java.use("javax.net.ssl.SSLContext");

                    const TrustManager = Java.registerClass({
                        // Implement a custom TrustManager
                        name: "dev.asd.test.TrustManager",
                        implements: [X509TrustManager],
                        methods: {
                            checkClientTrusted: function (chain, authType) {},
                            checkServerTrusted: function (chain, authType) {},
                            getAcceptedIssuers: function () { return []; }
                        }
                    });

                    // Prepare the TrustManager array to pass to SSLContext.init()
                    const TrustManagers = [TrustManager.$new()];
                    // Get a handle on the init() on the SSLContext class
                    const SSLContext_init = SSLContext.init.overload("[Ljavax.net.ssl.KeyManager;", "[Ljavax.net.ssl.TrustManager;", "java.security.SecureRandom");
                    // Override the init method, specifying the custom TrustManager
                    SSLContext_init.implementation = function (keyManager, trustManager, secureRandom) {
                        console.log("[✓] TrustManager [SSLContext] (Android < 7)");
                        SSLContext_init.call(this, keyManager, TrustManagers, secureRandom);
                    };
                } catch (e) {
                    console.log("[✘] TrustManager [SSLContext] (Android < 7) not found");
                }
            }


            // TrustManagerImpl (Android > 7) //
            if (MODE.ConscryptTrustManagerImpl) {

                console.log("\n[+] ConscryptTrustManagerImpl\n");

                const TrustManagerImpl = loadJava("com.android.org.conscrypt.TrustManagerImpl");

                // Bypass TrustManagerImpl.checkTrustedRecursive (Android > 7) {1}
                try {
                    const ArrayList = Java.use("java.util.ArrayList");
                    TrustManagerImpl.checkTrustedRecursive.implementation = function (certs, ocspData, tlsSctData, host, clientAuth, untrustedChain, trustAnchorChain, used) {
                        console.log(`[✓] Bypassing TrustManagerImpl [TrustedRecursive] (Android > 7): ${host}, ${untrustedChain}`);
                        return ArrayList.$new();
                    };
                } catch (e) {
                    console.log("[✘] TrustManagerImpl [checkTrustedRecursive] (Android > 7) not found");
                }

                // Bypass TrustManagerImpl.checkTrustedRecursive (Android > 7) {2}
                try {
                    const ArrayList = Java.use("java.util.ArrayList");
                    TrustManagerImpl.checkTrustedRecursive.implementation = function (certs, host, clientAuth, untrustedChain, trustAnchorChain, used) {
                        console.log(`[✓] Bypassing TrustManagerImpl [checkTrustedRecursive] (Android > 7): ${host}, ${untrustedChain}`);
                        return ArrayList.$new();
                    };
                } catch (e) {
                    console.log("[✘] TrustManagerImpl [checkTrustedRecursive] (Android > 7) not found");
                }

                // Bypass TrustManagerImpl.verifyChain (Android > 7) {1} (probably no more necessary)
                try {
                    TrustManagerImpl.verifyChain.implementation = function (untrustedChain, trustAnchorChain, host, clientAuth, ocspData, tlsSctData) {
                        console.log(`[✓] TrustManagerImpl [verifyChain] (Android > 7): ${host}, ${untrustedChain}`);;
                        return untrustedChain;
                    };
                } catch (e) {
                    console.log("[✘] TrustManagerImpl [verifyChain] (Android > 7) not found");
                }

                // Bypass TrustManagerImpl.verifyChain (Android > 7) {1} (probably no more necessary)
                try {
                    TrustManagerImpl.verifyChain.implementation = function (untrustedChain, trustAnchorChain, host, clientAuth) {
                        console.log(`[✓] TrustManagerImpl [verifyChain] (Android > 7): ${host}, ${untrustedChain}`);
                        return untrustedChain;
                    };
                } catch (e) {
                    console.log("[✘] TrustManagerImpl [verifyChain] (Android > 7) not found");
                }
            }
        });
    } else {
        console.log("\n[!] Java unavailable\n");
    }
    console.log("\n---- Capturing setup completed ----\n");
}, 0);
