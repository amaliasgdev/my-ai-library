package com.mibiblioteca.bookservice.book.cover;

import java.net.URI;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class CoverUrls {
    private static final Pattern FILENAME = Pattern.compile("[1-9][0-9]{0,18}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|png)");
    private final URI base;
    private final String prefix;

    public CoverUrls(CoverStorageProperties properties) {
        base = properties.publicBaseUrl();
        prefix = base.getRawPath().replaceAll("/+$", "") + "/";
    }

    public boolean validFilename(String filename) {
        if (filename == null || !FILENAME.matcher(filename).matches()) { return false; }
        try { return Long.parseLong(filename.substring(0, filename.indexOf('-'))) > 0; }
        catch (NumberFormatException ex) { return false; }
    }

    public String publicUrl(String filename) {
        if (!validFilename(filename)) { throw CoverException.storage(); }
        return base.toString().replaceAll("/+$", "") + "/" + filename;
    }

    public String ownedFilename(Long bookId, String url) {
        URI uri = parse(url);
        if (uri == null || !sameOrigin(uri) || uri.getRawQuery() != null || uri.getRawFragment() != null
            || uri.getRawUserInfo() != null || !uri.getRawPath().startsWith(prefix)) { return null; }
        String filename = uri.getRawPath().substring(prefix.length());
        return validFilename(filename) && filename.startsWith(bookId + "-") ? filename : null;
    }

    public void validateAssignment(Long bookId, String current, String proposed) {
        if (reserved(proposed) && !(proposed.equals(current) && ownedFilename(bookId, current) != null)) {
            throw new CoverException(HttpStatus.BAD_REQUEST, "Managed cover URLs can only be assigned by uploading a cover", "coverUrl");
        }
    }

    private boolean reserved(String url) {
        URI uri = parse(url);
        if (uri == null || !sameOrigin(uri)) { return false; }
        String path;
        try { path = new URI(null, null, uri.getPath(), null).normalize().getPath(); }
        catch (java.net.URISyntaxException ex) { return true; }
        return path.equals(prefix.substring(0, prefix.length() - 1)) || path.startsWith(prefix);
    }

    private boolean sameOrigin(URI uri) {
        return uri.getHost() != null && base.getScheme().equalsIgnoreCase(uri.getScheme())
            && base.getHost().equalsIgnoreCase(uri.getHost()) && effectivePort(base) == effectivePort(uri);
    }

    private int effectivePort(URI uri) {
        return uri.getPort() >= 0 ? uri.getPort() : "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }

    private URI parse(String value) {
        if (value == null) { return null; }
        try { return URI.create(value); } catch (IllegalArgumentException ex) { return null; }
    }
}
