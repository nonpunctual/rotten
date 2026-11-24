const DEFAULT_PORTS = {http: "80", https: "443"};

const URL_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*):(\/\/([^/?#]*))?([^?#]*)(\?[^#]*)?(#.*)?$/;
const HOST_PORT_RE = /^(\[[^\]]*\]|[^:]*)(?::(.*))?$/;

function splitParams(query) {
    return query.split("&")
        .filter((piece) => piece !== "")
        .map((piece) => {
            const i = piece.indexOf("=");
            return i < 0 ? [piece, ""] : [piece.slice(0, i), piece.slice(i + 1)];
        });
}

export function parseUrl(url) {
    if (typeof url !== "string") {
        return null;
    }
    const m = URL_RE.exec(url);
    if (!m) {
        return null;
    }
    const scheme = m[1].toLowerCase();
    let host = "";
    let port = "";
    if (m[2] !== undefined) {
        const authority = m[3].slice(m[3].lastIndexOf("@") + 1);
        const hp = HOST_PORT_RE.exec(authority);
        host = hp[1].toLowerCase();
        port = hp[2] ?? "";
        if (port !== "") {
            if (!/^[0-9]+$/.test(port) || Number(port) > 65535) {
                return null;
            }
            port = String(Number(port));
        }
        if (DEFAULT_PORTS[scheme] === port) {
            port = "";
        }
    }
    let path = m[4];
    if (scheme in DEFAULT_PORTS) {
        if (host === "") {
            return null;
        }
        if (path === "") {
            path = "/";
        }
    }
    const params = m[5] ? splitParams(m[5].slice(1)) : [];
    const fragment = m[6] ? m[6].slice(1) : "";
    return {scheme, host, port, path, params, fragment};
}

export function decodePath(path) {
    try {
        return decodeURIComponent(path);
    } catch {
        return path;
    }
}

export function isWeb(parsed) {
    return Boolean(parsed) && (parsed.scheme === "http" || parsed.scheme === "https");
}
