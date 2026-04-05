/*
 FB SSL Bypass
*/

console.log("\n[+] FB SSL Bypass Loaded\n");
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
    } catch (e) {
        console.log("[✘] Error loading", name + ":", e.message);
        return null;
    }
};

// load Binary
const loadSo = (name) => {
    try {
        const module = Process.findModuleByName(name);
        if (module) {
            console.log("[+] Module:", name);
            console.log("[+] Path:", module.path);
            return module;
        }
        console.log("[ᵎ!ᵎ] Module not loaded:", name);
        return null;
    } catch (e) {
        console.log("[✘] Error:", e.message);
        return null;
    }
};

function hookSSL() {
    try {

        /* /data/data/com.facebook.katana/lib-compressed/libcoldstart.so */
        var module = loadSo("libcoldstart.so");
        if (!module) return;

        // Find by export
        var exports = module.enumerateExports();

        for (var i = 0; i < exports.length; i++) {
            var exp = exports[i];

            if (exp.name.indexOf("verifyWithMetrics") !== -1) {
                var addr = exp.address;
                var symbol = exp.name;

                console.log(`[+] Symbol: ${symbol.substring(0, 80)}...`);
                console.log(`[+] Address: ${addr}`);

                // Patch
                Interceptor.attach(addr, {
                    onLeave: function(retval) {
                        retval.replace(ptr(1));
                    }
                });

                console.log(`[✓] Status: PATCHED\n`);
                return;
            }
        }
    } catch (e) {
        console.log("[✘] Error in hookSSL:", e.message);
    }
}

setTimeout(function() {
    hookSSL();
    console.log("\n--- Meta Bypass Loaded ---\n");
    if (Java.available) {
        console.log("[*] Java available");
        Java.perform(function() {

            // if SSL Unpinning by Native then may be skip CertificateVerifier
            if (MODE.FBCertificateVerifier) {

                const CertificateVerifier = loadJava("com.facebook.mobilenetwork.internal.certificateverifier.CertificateVerifier");

                if (CertificateVerifier) {

                    // verify()
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

                const NSTrustManager = loadJava('android.security.net.config.NetworkSecurityTrustManager');

                if (NSTrustManager) {
                    try {
                        NSTrustManager.isPinningEnforced.overload('java.util.List').implementation = function (chain) {
                            console.log('[✓] Bypassed isPinningEnforced');
                            return false;
                        };
                        console.log('[✓] NetworkSecurityTrustManager [isPinningEnforced] hook applied');
                    } catch (e) {
                        console.log(`[✘] NetworkSecurityTrustManager [isPinningEnforced] ${e}`);
                    }
                }
            }
        });
    } else {
        console.log(`[ᵎ!ᵎ] Java unavailable`);
    }
    console.log("\n---- Capturing setup completed ----\n");
}, 0);
