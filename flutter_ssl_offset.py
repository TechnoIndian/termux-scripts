#!/usr/bin/env python3

# pip install r2pipe

import r2pipe, sys

def generate_js(offset):
    js = """"use strict";

var TARGET_MODULE = "libflutter.so";
var TARGET_OFFSET = "%s";

var IS_FRIDA_17 = typeof Module.getGlobalExportByName === "function";

function _findModuleExport(libName, symName) {
    try {
        if (IS_FRIDA_17) {
            var m = Process.findModuleByName(libName);
            return m ? m.findExportByName(symName) : null;
        }
        return Module.findExportByName(libName, symName);
    } catch (_) { return null; }
}

function _findGlobalExport(symName) {
    try {
        if (IS_FRIDA_17) {
            return Module.getGlobalExportByName(symName);
        }
        return Module.findExportByName(null, symName);
    } catch (_) { return null; }
}

function _findExportInModule(moduleObj, symName) {
    try {
        if (IS_FRIDA_17) {
            return moduleObj.findExportByName(symName);
        }
        return Module.findExportByName(moduleObj.name, symName);
    } catch (_) { return null; }
}

function _resolveDlopen() {
    var libNames    = ["libdl.so", "libdl-android.so"];
    var symNames    = ["android_dlopen_ext", "dlopen"];
    var linkerNames = ["linker64", "linker"];
    var linkerSyms  = ["android_dlopen_ext", "__loader_android_dlopen_ext", "dlopen"];

    for (var li = 0; li < libNames.length; li++)
        for (var si = 0; si < symNames.length; si++) {
            var ep = _findModuleExport(libNames[li], symNames[si]);
            if (ep) return ep;
        }

    for (var li2 = 0; li2 < linkerNames.length; li2++)
        for (var si2 = 0; si2 < linkerSyms.length; si2++) {
            var ep2 = _findModuleExport(linkerNames[li2], linkerSyms[si2]);
            if (ep2) return ep2;
        }

    for (var si3 = 0; si3 < symNames.length; si3++) {
        var ep3 = _findGlobalExport(symNames[si3]);
        if (ep3) return ep3;
    }

    var found = null;
    Process.enumerateModules().forEach(function (m) {
        if (found) return;
        for (var si4 = 0; si4 < symNames.length; si4++) {
            var ep4 = _findExportInModule(m, symNames[si4]);
            if (ep4) { found = ep4; break; }
        }
    });
    return found;
}

function hookCandidate(mod, candidate) {
    var addr = mod.base.add(candidate.rva);
    if (addr.compare(mod.base.add(mod.size)) >= 0) {
        return;
    }
    try {
        Interceptor.attach(addr, {
            onLeave: function (retval) {
                retval.replace(ptr(1));
            }
        });
    } catch (e) { }
}

function bypassSslPinning(mod) {
    hookCandidate(mod, { rva: TARGET_OFFSET });
    console.log("[+] SSL pinning bypassed on " + mod.name + " @ " + mod.base);
}

var mod = Process.findModuleByName(TARGET_MODULE);
if (mod) {
    bypassSslPinning(mod);
} else {
    var dlopenPtr = _resolveDlopen();
    if (dlopenPtr) {
        var listener = Interceptor.attach(dlopenPtr, {
            onEnter: function (args) {
                this.isTarget = false;
                if (args[0].isNull()) return;
                var path = args[0].readCString();
                if (path && path.indexOf("libflutter.so") !== -1) {
                    this.isTarget = true;
                }
            },
            onLeave: function (retval) {
                if (!this.isTarget) return;
                var loadedMod = Process.findModuleByName(TARGET_MODULE);
                if (loadedMod) {
                    bypassSslPinning(loadedMod);
                    listener.detach();
                }
            }
        });
    }
}
""" % offset

    # print
    print("\n===== GENERATED FRIDA SCRIPT =====\n")

    # save file
    with open("flutter_ssl_pinning.js", "w") as f:
        f.write(js)

    print("\n[✔] Saved as flutter_ssl_pinning.js\n")

    return js


def find_function_target_offset(r2, addr):
    """
    Find function start address by looking for 'sub sp, sp, 0x70' prologue
    """
    print(f"\n[*] Find Function from {addr}...\n")

    data = r2.cmdj(f"pdj -200 @ {addr}")

    if not data:
        return None

    for ins in data:
        opcode = ins.get("opcode", "")
        if opcode.startswith("sub sp, sp, 0x70"):
            return hex(ins.get("addr", 0))

    return None


def find_ssl_server_function(r2):
    """
    Main analysis flow to find ssl_server related function
    """
    # Step 1: Locate ssl_server string
    print("\n[1] Searching for 'ssl_server' string...\n")

    strings = r2.cmd("iz~ssl_server")

    print(strings)

    if not strings.strip():
        print("\n[-] ssl_server not found\n")
        return

    string_addresses = []

    for line in strings.splitlines():
        parts = line.split()
        if len(parts) >= 3:
            for part in parts:
                if part.startswith("0x"):
                    string_addresses.append(part)
                    break

    found_global = False

    # Step 2: Find references to the string
    for string_address in string_addresses:
        if found_global:
            break

        print(f"\n[2] Finding cross-references to {string_address}\n")

        xref = r2.cmd(f"axt @ {string_address}")

        print(xref)

        helper_functions = []

        for line in xref.splitlines():
            if "fcn." in line:
                helper_functions.append(line.split()[0])

        if not helper_functions:
            print("[-] No helper functions found\n")
            continue

        for helper_function in helper_functions:

            print(f"\n[+] Helper function: {helper_function}\n")

            # Step 3: Find all callers of helper function
            print(f"\n[3] Finding callers of {helper_function}\n")

            callers = r2.cmd(f"axt @ {helper_function}")

            print(callers)

            targets = []

            for line in callers.splitlines():

                parts = line.split()

                for part in parts:
                    if part.startswith("0x"):
                        targets.append(part)
                        break

            if not targets:
                print("\n[-] No target calls found\n")
                continue

            found = False

            for target_call in targets:

                print(f"\n[*] Call site: {target_call}\n")

                function_offset = find_function_target_offset(r2, target_call)

                if function_offset:
                    r2.cmd(f"af @ {function_offset}")
                    print(f"[✔] TARGET OFFSET: {function_offset}\n")

                    generate_js(function_offset)

                    found = True
                    break
                else:
                    print("[!] Failed to locate function offset\n")

            if found:
                found_global = True
                break


def main(binary_path):

    r2 = r2pipe.open(binary_path)
    r2.cmd("aaa")
    
    find_ssl_server_function(r2)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python script.py libflutter.so")
        sys.exit(1)

    main(sys.argv[1])
