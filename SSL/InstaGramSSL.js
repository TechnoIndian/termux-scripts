/*
 InstaGram SSL Bypass
*/

console.log("\n[+] InstaGram SSL Bypass Loaded\n");
console.log("[+] Arch:", Process.arch);

var moduleName = "libscrollmerged.so"; // /data/data/lib-compressed/*.so
var maxRetries = 10;
var retryCount = 0;

function hookSSL() {

    var module = Process.findModuleByName(moduleName);

    if (!module) {
        retryCount++;
        if (retryCount <= maxRetries) {
            console.log(`[!] Waiting for ${moduleName} (${retryCount}/${maxRetries})`);
            setTimeout(hookSSL, 1000);
        }
        return;
    }

    // Find by export
    var exports = module.enumerateExports();

    try {
        for (var i = 0; i < exports.length; i++) {
            var exp = exports[i];

            if (exp.name.indexOf("verifyWithMetrics") !== -1) {
                var addr = exp.address;
                var symbol = exp.name;

                console.log(`[+] Module: ${moduleName}`);
                console.log(`[+] Symbol: ${symbol.substring(0, 80)}...`);
                console.log(`[+] Address: ${addr}`);

                // Patch
                Interceptor.attach(addr, {
                    onLeave: function(retval) {
                        retval.replace(ptr(1));
                    }
                });

                console.log(`[+] Status: PATCHED ✓\n`);
                return;
            }
        }
    } catch (e) {
        console.error("[-] verifyWithMetrics not found, Error:");
        console.error(e);
    }
}

// hookSSL(); // It is not required in the current version.

// https://github.com/logosred/murder-meta-bypass
// Simple script to bypass SSL pinning in Instagram.
Java.perform(function() {
    console.log("--- Murder Meta Bypass Loaded ---");
    console.log("--- Targeting the core 'verify' method ---");
    try {
        const CertificateVerifier = Java.use("com.facebook.mobilenetwork.internal.certificateverifier.CertificateVerifier");

        // verify()
        CertificateVerifier.verify.overload(
            '[Ljava.security.cert.X509Certificate;',
            'java.lang.String',
            'boolean'
        ).implementation = function(certChain, hostname, someBoolean) {
            console.log(`[+] Bypassed CertificateVerifier.verify(certChain, "${hostname}", ${someBoolean}). Certificate chain is now trusted.`);
            return;
        };

        console.log("[+] Hook on CertificateVerifier.verify with correct signature is active.");

        // verifyWithProofOfPossession
        CertificateVerifier.verifyWithProofOfPossession.overload(
            '[[B',
            'java.lang.String',
            'boolean',
            'int',
            '[B',
            '[B'
        ).implementation = function(certBytes, hostname, flag, intVal, arr1, arr2) {
            console.log(`[+] verifyWithProofOfPossession bypassed -> ${hostname}`);
            return;
        };

        console.log("[+] Hooked: verifyWithProofOfPossession");
    
    } catch (e) {
        console.error("[-] Failed to hook:");
        console.error(e);
    }
});
