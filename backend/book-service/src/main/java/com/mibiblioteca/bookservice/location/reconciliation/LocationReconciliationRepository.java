package com.mibiblioteca.bookservice.location.reconciliation;

import static com.mibiblioteca.bookservice.location.reconciliation.ReconciliationDtos.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/** PostgreSQL owns grouping/comparison; no Java/JS case folding or inferred identities. */
@Repository
public class LocationReconciliationRepository {
    public record Canonical(String room, String bookcase, String shelf) {}
    private static final String SPACES = " \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\ufeff";
    private static String normal(String column) { return "lower(nullif(btrim(" + column + ", :spaces), ''))"; }
    private static final String PENDING = "shelf_id IS NULL AND (" + normal("room") + " IS NOT NULL OR " + normal("bookcase") + " IS NOT NULL OR " + normal("shelf") + " IS NOT NULL)";
    private static final String GROUPS = "WITH normalized AS (SELECT id,room,bookcase,shelf," + normal("room") + " nr," + normal("bookcase") + " nb," + normal("shelf") + " ns FROM book WHERE " + PENDING + "), groups AS ("
        + "SELECT nr,nb,ns,(array_agg(room ORDER BY id))[1] room,(array_agg(bookcase ORDER BY id))[1] bookcase,(array_agg(shelf ORDER BY id))[1] shelf,"
        + "count(*) book_count,count(DISTINCT jsonb_build_array(room,bookcase,shelf)) variant_count,"
        + "(nr IS NOT NULL AND nb IS NOT NULL AND ns IS NOT NULL) complete FROM normalized GROUP BY nr,nb,ns) ";
    private static final String MEMBER_WHERE = PENDING + " AND " + normal("room") + " IS NOT DISTINCT FROM :room AND " + normal("bookcase") + " IS NOT DISTINCT FROM :bookcase AND " + normal("shelf") + " IS NOT DISTINCT FROM :shelf";
    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper mapper;
    public LocationReconciliationRepository(NamedParameterJdbcTemplate jdbc, ObjectMapper mapper) { this.jdbc = jdbc; this.mapper = mapper; }
    private MapSqlParameterSource params() { return new MapSqlParameterSource("spaces", SPACES); }
    private MapSqlParameterSource params(Canonical value) { return params().addValue("room", value.room()).addValue("bookcase", value.bookcase()).addValue("shelf", value.shelf()); }
    public String key(Canonical value) {
        try { return Base64.getUrlEncoder().withoutPadding().encodeToString(mapper.writeValueAsBytes(Arrays.asList(value.room(), value.bookcase(), value.shelf()))); }
        catch (Exception ex) { throw new IllegalStateException("Cannot encode group", ex); }
    }
    public Canonical canonical(String key) {
        try {
            if (key == null || key.length() > 2048) throw ReconciliationException.invalid();
            var node = mapper.readTree(new String(Base64.getUrlDecoder().decode(key), StandardCharsets.UTF_8));
            if (!node.isArray() || node.size() != 3) throw ReconciliationException.invalid();
            String[] values = new String[3];
            for (int i=0; i<3; i++) {
                var v = node.get(i); if (!v.isNull() && (!v.isTextual() || v.textValue().length() > (i == 2 ? 50 : 100))) throw ReconciliationException.invalid();
                values[i] = v.isNull() ? null : v.textValue();
                if (values[i] != null && !new com.mibiblioteca.bookservice.book.validation.LocationLabelValidator().isValid(values[i],null)) throw ReconciliationException.invalid();
            }
            var result = new Canonical(values[0], values[1], values[2]);
            if (!key(result).equals(key) || Arrays.stream(values).allMatch(java.util.Objects::isNull)) throw ReconciliationException.invalid();
            // Reject noncanonical case/trim encodings using the same database semantics.
            for (String value : values) if (value != null && !value.equals(jdbc.queryForObject("SELECT " + normal("CAST(:value AS text)"), params().addValue("value", value), String.class))) throw ReconciliationException.invalid();
            return result;
        } catch (ReconciliationException ex) { throw ex; }
        catch (org.springframework.dao.DataAccessException ex) { throw ex; }
        catch (Exception ex) { throw ReconciliationException.invalid(); }
    }
    public Statistics statistics() {
        return jdbc.queryForObject(GROUPS + "SELECT count(*) pending_groups,coalesce(sum(book_count),0) pending_books,count(*) FILTER (WHERE complete) complete_groups,count(*) FILTER (WHERE NOT complete) partial_groups FROM groups", params(),
            (rs, n) -> new Statistics(rs.getLong(1), rs.getLong(2), rs.getLong(3), rs.getLong(4)));
    }
    public GroupsPage groups(int page, int size, Type type, String text) {
        var params = params().addValue("type", type.name()).addValue("text", text).addValue("limit", size).addValue("offset", (long)page * size);
        String filter = " WHERE (:type='ALL' OR (:type='COMPLETE' AND complete) OR (:type='PARTIAL' AND NOT complete)) AND (:text='' OR position(lower(:text) in concat_ws(' / ',nr,nb,ns))>0)";
        long count = jdbc.queryForObject(GROUPS + "SELECT count(*) FROM groups" + filter, params, Long.class);
        // Correlated aggregation returns at most one DTO suggestion per group; no per-group requests/N+1.
        String matches = " LEFT JOIN LATERAL (SELECT count(*) matches,min(r.id) rid,min(r.name) rn,min(c.id) cid,min(c.name) cn,min(s.id) sid,min(s.name) sn FROM shelf s JOIN bookcase c ON c.id=s.bookcase_id JOIN room r ON r.id=c.room_id WHERE g.complete AND "
            + normal("r.name") + "=g.nr AND " + normal("c.name") + "=g.nb AND " + normal("s.name") + "=g.ns) m ON true";
        var rows = jdbc.query(GROUPS + "SELECT g.*,m.* FROM (SELECT * FROM groups" + filter + " ORDER BY nr NULLS FIRST,nb NULLS FIRST,ns NULLS FIRST LIMIT :limit OFFSET :offset) g" + matches, params, (rs,n) -> {
            long found = rs.getLong("matches"); boolean complete = rs.getBoolean("complete");
            Destination destination = found == 1 ? new Destination(rs.getLong("rid"), rs.getString("rn"), rs.getLong("cid"), rs.getString("cn"), rs.getLong("sid"), rs.getString("sn")) : null;
            return new Group(key(new Canonical(rs.getString("nr"),rs.getString("nb"),rs.getString("ns"))), rs.getString("room"),rs.getString("bookcase"),rs.getString("shelf"),rs.getLong("variant_count"),rs.getLong("book_count"),complete ? Type.COMPLETE : Type.PARTIAL,match(complete, found),destination);
        });
        return new GroupsPage(rows,page,size,count,(count + size - 1)/size,statistics());
    }
    public Match match(boolean complete, long matches) { return !complete ? Match.NOT_APPLICABLE : matches == 0 ? Match.NONE : matches == 1 ? Match.EXACT : Match.AMBIGUOUS; }
    public List<LegacyBook> members(Canonical group, boolean lock) {
        return jdbc.query("SELECT id,title,author,isbn,room,bookcase,shelf FROM book WHERE " + MEMBER_WHERE + " ORDER BY id" + (lock ? " FOR UPDATE" : ""), params(group),
            (rs,n) -> new LegacyBook(rs.getLong("id"),rs.getString("title"),rs.getString("author"),rs.getString("isbn"),rs.getString("room"),rs.getString("bookcase"),rs.getString("shelf")));
    }
    public List<Destination> suggestions(Canonical value) {
        if (value.room() == null || value.bookcase() == null || value.shelf() == null) return List.of();
        return jdbc.query("SELECT r.id rid,r.name rn,c.id cid,c.name cn,s.id sid,s.name sn FROM shelf s JOIN bookcase c ON c.id=s.bookcase_id JOIN room r ON r.id=c.room_id WHERE " + normal("r.name") + "=:room AND " + normal("c.name") + "=:bookcase AND " + normal("s.name") + "=:shelf ORDER BY s.id", params(value),
            (rs,n) -> new Destination(rs.getLong("rid"),rs.getString("rn"),rs.getLong("cid"),rs.getString("cn"),rs.getLong("sid"),rs.getString("sn")));
    }
    public Destination lockDestination(long shelfId) {
        jdbc.getJdbcTemplate().execute("SET LOCAL lock_timeout = '3s'");
        var path = jdbc.query("SELECT r.id rid,r.name rn,c.id cid,c.name cn,s.id sid,s.name sn FROM shelf s JOIN bookcase c ON c.id=s.bookcase_id JOIN room r ON r.id=c.room_id WHERE s.id=:id", Map.of("id",shelfId),
            (rs,n) -> new Destination(rs.getLong("rid"),rs.getString("rn"),rs.getLong("cid"),rs.getString("cn"),rs.getLong("sid"),rs.getString("sn")));
        if (path.isEmpty()) throw ReconciliationException.missing();
        Destination value = path.getFirst();
        // Required parents are immutable. Lock root to leaf, then books in ascending ID.
        for (var entry : List.of(Map.entry("room",value.roomId()),Map.entry("bookcase",value.bookcaseId()),Map.entry("shelf",value.shelfId()))) {
            jdbc.queryForObject("SELECT id FROM " + entry.getKey() + " WHERE id=:id FOR SHARE", Map.of("id",entry.getValue()),Long.class);
        }
        return value;
    }
    public int assign(List<LegacyBook> books, long shelfId) {
        // Only previously verified and locked IDs. No open location predicate on UPDATE.
        // A PostgreSQL array avoids a parameter-count limit on large reviewed groups.
        return jdbc.getJdbcTemplate().execute((org.springframework.jdbc.core.ConnectionCallback<Integer>) connection -> {
            var ids = connection.createArrayOf("bigint", books.stream().map(LegacyBook::id).toArray(Long[]::new));
            try (var statement = connection.prepareStatement("UPDATE book SET shelf_id=?,room=NULL,bookcase=NULL,shelf=NULL,updated_at=clock_timestamp() WHERE id = ANY (?) AND shelf_id IS NULL")) {
                statement.setLong(1,shelfId); statement.setArray(2,ids);
                return statement.executeUpdate();
            } finally { ids.free(); }
        });
    }
}
