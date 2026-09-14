const dns = require("dns").promises;
const net = require("net");


// --------------------------------
// CHECK PRIVATE IP
// --------------------------------

const isPrivateIp = (ip) => {

    if (!ip) {
        return true;
    }

    const version = net.isIP(ip);

    if (version === 4) {

        const parts =
            ip.split(".").map(Number);

        const [a, b] = parts;

        // 10.0.0.0/8
        if (a === 10) {
            return true;
        }

        // 127.0.0.0/8
        if (a === 127) {
            return true;
        }

        // 169.254.0.0/16
        if (a === 169 && b === 254) {
            return true;
        }

        // 172.16.0.0/12
        if (
            a === 172 &&
            b >= 16 &&
            b <= 31
        ) {
            return true;
        }

        // 192.168.0.0/16
        if (
            a === 192 &&
            b === 168
        ) {
            return true;
        }

        // 0.0.0.0/8
        if (a === 0) {
            return true;
        }
    }


    if (version === 6) {

        const normalized =
            ip.toLowerCase();

        // IPv6 localhost
        if (
            normalized === "::1"
        ) {
            return true;
        }

        // IPv6 unspecified
        if (
            normalized === "::"
        ) {
            return true;
        }

        // Unique local address fc00::/7
        if (
            normalized.startsWith("fc") ||
            normalized.startsWith("fd")
        ) {
            return true;
        }

        // Link-local fe80::/10
        if (
            normalized.startsWith("fe8") ||
            normalized.startsWith("fe9") ||
            normalized.startsWith("fea") ||
            normalized.startsWith("feb")
        ) {
            return true;
        }
    }


    return false;
};


// --------------------------------
// BLOCKED HOSTNAMES
// --------------------------------

const blockedHostnames = [
    "localhost",
    "localhost.localdomain",
    "ip6-localhost",
    "ip6-loopback"
];


// --------------------------------
// VALIDATE STORE URL
// --------------------------------

const validateStoreUrl = async (value) => {

    let url;

    try {
        url = new URL(value);
    } catch {
        return {
            valid: false,
            message: "Invalid URL"
        };
    }


    // Only HTTP/HTTPS
    if (
        !["http:", "https:"]
            .includes(url.protocol)
    ) {
        return {
            valid: false,
            message:
                "Only HTTP and HTTPS URLs are allowed"
        };
    }


    const hostname =
        url.hostname.toLowerCase();


    // Block empty hostname
    if (!hostname) {
        return {
            valid: false,
            message: "URL hostname is required"
        };
    }


    // Block known local hostnames
    if (
        blockedHostnames.includes(
            hostname
        )
    ) {
        return {
            valid: false,
            message:
                "Local URLs are not allowed"
        };
    }


    // If hostname itself is an IP
    if (net.isIP(hostname)) {

        if (isPrivateIp(hostname)) {
            return {
                valid: false,
                message:
                    "Private or local IP addresses are not allowed"
            };
        }

        return {
            valid: true,
            url
        };
    }


    // Resolve hostname
    let addresses;

    try {

        addresses =
            await dns.lookup(
                hostname,
                {
                    all: true
                }
            );

    } catch {
        return {
            valid: false,
            message:
                "Unable to resolve website hostname"
        };
    }


    // Check every resolved IP
    for (const address of addresses) {

        if (
            isPrivateIp(
                address.address
            )
        ) {
            return {
                valid: false,
                message:
                    "Website resolves to a private or local IP address"
            };
        }
    }


    return {
        valid: true,
        url
    };
};


module.exports = {
    validateStoreUrl
};