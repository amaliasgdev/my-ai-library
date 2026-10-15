package com.mibiblioteca.bookservice.location.reconciliation;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static com.mibiblioteca.bookservice.location.reconciliation.ReconciliationDtos.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class LocationReconciliationIntegrationTest {
    @Autowired LocationReconciliationService service;
    @Autowired LocationReconciliationRepository repository;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired ReviewToken tokens;
    @Autowired javax.sql.DataSource dataSource;
    private long book(String room,String bookcase,String shelf) {
        return jdbc.queryForObject("INSERT INTO book(title,author,isbn,room,bookcase,shelf) VALUES ('Reconcile title','Reconcile author',NULL,?,?,?) RETURNING id",Long.class,room,bookcase,shelf);
    }
    private Destination destination() {
        long room=jdbc.queryForObject("INSERT INTO room(name) VALUES ('Salón') RETURNING id",Long.class);
        long bookcase=jdbc.queryForObject("INSERT INTO bookcase(room_id,name) VALUES (?,'Billy') RETURNING id",Long.class,room);
        long shelf=jdbc.queryForObject("INSERT INTO shelf(bookcase_id,name) VALUES (?,'1') RETURNING id",Long.class,bookcase);
        return new Destination(room,"Salón",bookcase,"Billy",shelf,"1");
    }
    private Group group(String room) { return service.groups(0,100,Type.ALL,room).content().getFirst(); }
    private AssignRequest request(Detail detail,Destination target) { return new AssignRequest(detail.reviewToken(),target.shelfId(),target.labels()); }
    @Test void postgresNormalizesCaseTrimAndNullsButPreservesAccentsPunctuationAndInternalSpaces() {
        assertThat(jdbc.queryForObject("show server_version",String.class)).startsWith("16.");
        book("Salón","Billy","1"); book("\u00a0salón\ufeff"," Billy ","1");
        book("Salon","Billy","1"); book("Salón","Billy izquierda","1"); book("Salón","Billy izq.","1"); book("Salón","Billy  izquierda","1");
        book("Dormitorio",null,null); book(null,"Estantería","Superior"); book(null,null,"3"); book(null,null,null); book(" \u00a0",null,"");
        var result=service.groups(0,100,Type.ALL,"");
        assertThat(result.statistics()).isEqualTo(new Statistics(8,9,5,3));
        var salon=result.content().stream().filter(g -> g.bookCount()==2).findFirst().orElseThrow();
        assertThat(salon.variantCount()).isEqualTo(2); assertThat(salon.type()).isEqualTo(Type.COMPLETE);
        assertThat(service.groups(0,100,Type.PARTIAL,"").content()).allMatch(g -> g.type()==Type.PARTIAL && g.match()==Match.NOT_APPLICABLE);
        assertThat(service.groups(0,100,Type.COMPLETE,"Salon").content()).hasSize(1);
        assertThat(service.groups(0,100,Type.ALL,"izq.").content()).hasSize(1);
    }
    @Test void groupingKeyDistinguishesNullsAndDelimiterLikeStrings() {
        var a=new LocationReconciliationRepository.Canonical(null,"a/b","c");
        var b=new LocationReconciliationRepository.Canonical("a","b/c",null);
        assertThat(repository.key(a)).isNotEqualTo(repository.key(b));
        assertThat(repository.canonical(repository.key(a))).isEqualTo(a);
        assertThat(repository.match(true,2)).isEqualTo(Match.AMBIGUOUS);
    }
    @Test void listPaginationStatisticsAndExactSuggestionNeverIncludeStructuredBooks() throws Exception {
        var target=destination(); long structured=book(null,null,null); jdbc.update("UPDATE book SET shelf_id=? WHERE id=?",target.shelfId(),structured);
        book("salón","BILLY","1"); book("Salón","Billy","2"); book("Dormitorio",null,null);
        var list=service.groups(0,1,Type.COMPLETE,"salón");
        assertThat(list.totalElements()).isEqualTo(2); assertThat(list.totalPages()).isEqualTo(2); assertThat(list.content()).hasSize(1);
        assertThat(list.statistics()).isEqualTo(new Statistics(3,3,2,1));
        assertThat(list.content().getFirst().match()).isEqualTo(Match.EXACT);
        assertThat(list.content().getFirst().destinationSuggestion()).isEqualTo(target);
        assertThat(service.groups(1,1,Type.COMPLETE,"salón").content().getFirst().match()).isEqualTo(Match.NONE);
        mvc.perform(get("/api/locations/reconciliation")).andExpect(status().isOk()).andExpect(jsonPath("$.content[0].books").doesNotExist()).andExpect(jsonPath("$.content[0].bookIds").doesNotExist());
    }
    @Test void detailReviewsEntireGroupNotOnlyBookPageAndExposesOriginalVariants() throws Exception {
        long first=book("Salón","Billy","1"); book("salón","Billy","1");
        String key=group("salón").groupKey(); var detail=service.detail(key,0,1);
        assertThat(detail.reviewedCount()).isEqualTo(2); assertThat(detail.content()).hasSize(1); assertThat(detail.content().getFirst().id()).isEqualTo(first);
        assertThat(detail.variants()).hasSize(2); assertThat(detail.totalPages()).isEqualTo(2);
        var next=service.detail(key,1,1); assertThat(next.snapshotFingerprint()).isEqualTo(detail.snapshotFingerprint());
        mvc.perform(get("/api/locations/reconciliation/{key}",key).param("size","1")).andExpect(status().isOk()).andExpect(jsonPath("$.reviewedCount").value(2)).andExpect(jsonPath("$.content[0].title").value("Reconcile title"));
    }
    @Test void assignsWholeGroupAndOnlyLocationColumnsWithConstraintPreserved() {
        var target=destination(); long a=book("Salón","Billy","1"); long b=book("salón","Billy","1"); long unrelated=book("Salon","Billy","1");
        long structured=book(null,null,null); jdbc.update("UPDATE book SET shelf_id=? WHERE id=?",target.shelfId(),structured);
        var before=jdbc.queryForMap("SELECT title,author,isbn,description,rating,reading_status,created_at FROM book WHERE id=?",a);
        var detail=service.detail(group("salón").groupKey(),0,1); var result=service.assign(request(detail,target));
        assertThat(result.affectedCount()).isEqualTo(2);
        for (long id:new long[]{a,b}) {
            var row=jdbc.queryForMap("SELECT shelf_id,room,bookcase,shelf FROM book WHERE id=?",id);
            assertThat(row.get("shelf_id")).isEqualTo(target.shelfId()); assertThat(row.get("room")).isNull(); assertThat(row.get("bookcase")).isNull(); assertThat(row.get("shelf")).isNull();
        }
        assertThat(jdbc.queryForMap("SELECT title,author,isbn,description,rating,reading_status,created_at FROM book WHERE id=?",a)).isEqualTo(before);
        assertThat(jdbc.queryForObject("SELECT shelf_id FROM book WHERE id=?",Long.class,unrelated)).isNull();
        assertThat(jdbc.queryForObject("SELECT shelf_id FROM book WHERE id=?",Long.class,structured)).isEqualTo(target.shelfId());
        assertThatThrownBy(() -> service.assign(request(detail,target))).isInstanceOfSatisfying(ReconciliationException.class,e -> assertThat(e.code()).isEqualTo("RECONCILIATION_STALE"));
    }
    @ParameterizedTest @ValueSource(strings={"replace","texts","convert","delete","new"})
    void anyMembershipOrOriginalTextChangeConflictsWithoutTouchingOtherMembers(String change) {
        var target=destination(); long a=book("Salón","Billy","1"); long b=book("salón","Billy","1");
        var detail=service.detail(group("salón").groupKey(),0,1);
        switch(change) {
            case "replace" -> { jdbc.update("DELETE FROM book WHERE id=?",a); book("Salón","Billy","1"); }
            case "texts" -> jdbc.update("UPDATE book SET room='SALÓN' WHERE id=?",a);
            case "convert" -> jdbc.update("UPDATE book SET room=NULL,bookcase=NULL,shelf=NULL,shelf_id=? WHERE id=?",target.shelfId(),a);
            case "delete" -> jdbc.update("DELETE FROM book WHERE id=?",a);
            case "new" -> book("Salón","Billy","1");
        }
        assertThatThrownBy(() -> service.assign(request(detail,target))).isInstanceOfSatisfying(ReconciliationException.class,e -> assertThat(e.code()).isEqualTo("RECONCILIATION_STALE"));
        assertThat(jdbc.queryForObject("SELECT shelf_id FROM book WHERE id=?",Long.class,b)).isNull();
    }
    @Test void partialNeedsNoInventedParentsAndCanBeExplicitlyAssigned() {
        var target=destination(); book(null,null,"3"); var detail=service.detail(group("3").groupKey(),0,20);
        assertThat(detail.group().match()).isEqualTo(Match.NOT_APPLICABLE); assertThat(detail.group().destinationSuggestion()).isNull();
        assertThat(service.assign(request(detail,target)).affectedCount()).isEqualTo(1);
    }
    @Test void bibliographicChangesDoNotInvalidateReview() {
        var target=destination(); long id=book("Salón","Billy","1"); var detail=service.detail(group("Salón").groupKey(),0,20);
        jdbc.update("UPDATE book SET title='Edited title',updated_at=clock_timestamp() WHERE id=?",id);
        assertThat(service.assign(request(detail,target)).affectedCount()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT title FROM book WHERE id=?",String.class,id)).isEqualTo("Edited title");
    }
    @Test void missingAndRenamedDestinationHaveSafeHttpErrorsAndNoConversion() throws Exception {
        var target=destination(); long id=book("Salón","Billy","1"); var detail=service.detail(group("Salón").groupKey(),0,20);
        mvc.perform(post("/api/locations/reconciliation/assign").contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsBytes(new AssignRequest(detail.reviewToken(),9007199254740991L,target.labels())))).andExpect(status().isNotFound());
        jdbc.update("UPDATE room SET name='Renamed' WHERE id=?",target.roomId());
        mvc.perform(post("/api/locations/reconciliation/assign").contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsBytes(request(detail,target))))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("RECONCILIATION_DESTINATION_CHANGED"));
        assertThat(jdbc.queryForObject("SELECT shelf_id FROM book WHERE id=?",Long.class,id)).isNull();
    }
    @ParameterizedTest @ValueSource(strings={"?page=-1","?size=0","?size=101","?type=OTHER"})
    void invalidParametersAre400(String query) throws Exception { mvc.perform(get("/api/locations/reconciliation"+query)).andExpect(status().isBadRequest()); }
    @Test void malformedRequestsAndGroupKeysAre400AndAbsentGroup404() throws Exception {
        mvc.perform(get("/api/locations/reconciliation/invalid")).andExpect(status().isBadRequest());
        String key=repository.key(new LocationReconciliationRepository.Canonical("absent",null,null));
        mvc.perform(get("/api/locations/reconciliation/{key}",key)).andExpect(status().isNotFound());
        for (String body:List.of("{}","{\"reviewToken\":\"bad\",\"shelfId\":0}","{\"reviewToken\":\"bad\",\"shelfId\":1,\"expectedDestination\":{\"room\":\"R\",\"bookcase\":\"B\",\"shelf\":\"S\"}}")) {
            mvc.perform(post("/api/locations/reconciliation/assign").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
        }
    }

    @Test void ambiguousNormalizedDestinationNeverChoosesFirstAndKeepsExistingConstraints() {
        destination();
        long secondRoom=jdbc.queryForObject("INSERT INTO room(name) VALUES (' Salón') RETURNING id",Long.class);
        long secondCase=jdbc.queryForObject("INSERT INTO bookcase(room_id,name) VALUES (?,'Billy') RETURNING id",Long.class,secondRoom);
        jdbc.update("INSERT INTO shelf(bookcase_id,name) VALUES (?,'1')",secondCase);
        book("Salón","Billy","1");
        var group=group("Salón"); assertThat(group.match()).isEqualTo(Match.AMBIGUOUS); assertThat(group.destinationSuggestion()).isNull();
        assertThat(service.detail(group.groupKey(),0,20).group().match()).isEqualTo(Match.AMBIGUOUS);
    }

    @Test void expiredSignedReviewIs409AndTampering400WithoutLeakingTokenDetails() throws Exception {
        var target=destination(); book("Salón","Billy","1"); var detail=service.detail(group("Salón").groupKey(),0,20);
        var expired=new ReviewToken.Snapshot(1,detail.group().groupKey(),detail.reviewedCount(),detail.snapshotFingerprint(),java.time.Instant.now().minusSeconds(1800),java.time.Instant.now().minusSeconds(900));
        mvc.perform(post("/api/locations/reconciliation/assign").contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsBytes(new AssignRequest(tokens.sign(expired),target.shelfId(),target.labels()))))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("RECONCILIATION_EXPIRED"));
        mvc.perform(post("/api/locations/reconciliation/assign").contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsBytes(new AssignRequest("A"+detail.reviewToken(),target.shelfId(),target.labels()))))
            .andExpect(status().isBadRequest()).andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("HMAC"))));
    }

    @Test void listUsesThreeBoundedQueriesNotPerGroupQueries() {
        for(int i=0;i<10;i++) book("Room "+i,"Case","Shelf");
        var sql=org.mockito.Mockito.spy(new org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate(dataSource));
        var tested=new LocationReconciliationRepository(sql,mapper);
        assertThat(tested.groups(0,20,Type.ALL,"").content()).hasSize(10);
        org.mockito.Mockito.verify(sql,org.mockito.Mockito.times(1)).query(org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.any(org.springframework.jdbc.core.namedparam.SqlParameterSource.class),org.mockito.ArgumentMatchers.<org.springframework.jdbc.core.RowMapper<Group>>any());
        org.mockito.Mockito.verify(sql,org.mockito.Mockito.times(1)).queryForObject(org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.any(org.springframework.jdbc.core.namedparam.SqlParameterSource.class),org.mockito.ArgumentMatchers.eq(Long.class));
        // The Long overload delegates to the RowMapper overload: two executions, not three.
        org.mockito.Mockito.verify(sql,org.mockito.Mockito.times(2)).queryForObject(org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.any(org.springframework.jdbc.core.namedparam.SqlParameterSource.class),org.mockito.ArgumentMatchers.<org.springframework.jdbc.core.RowMapper<Statistics>>any());
    }
}
