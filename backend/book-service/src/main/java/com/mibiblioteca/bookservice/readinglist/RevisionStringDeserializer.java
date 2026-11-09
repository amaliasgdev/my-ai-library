package com.mibiblioteca.bookservice.readinglist;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.deser.std.StdDeserializer;
import java.io.IOException;

/** Do not let Jackson silently coerce JSON numbers/booleans into revision strings. */
public class RevisionStringDeserializer extends StdDeserializer<String> {
    public RevisionStringDeserializer() { super(String.class); }

    @Override
    public String deserialize(JsonParser parser, DeserializationContext context) throws IOException {
        if (parser.hasToken(JsonToken.VALUE_STRING)) return parser.getText();
        return (String) context.handleUnexpectedToken(String.class, parser);
    }
}
