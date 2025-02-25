import React from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { Box, Container, Typography, Grid, Paper, Button } from '@mui/material';
import { styled } from '@mui/material/styles';

const Section = styled(Box)(({ theme }) => ({
  marginBottom: theme.spacing(8)
}));

const MetricCard = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(3),
  textAlign: 'center',
  height: '100%'
}));

const TestimonialBox = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(4),
  backgroundColor: theme.palette.grey[50],
  marginTop: theme.spacing(4),
  marginBottom: theme.spacing(4)
}));

const CaseStudy = () => {
  const { id } = useParams();

  // In a real application, this would come from an API or database
  const caseStudies = {
    'shiny-dog-paws': {
      title: 'Shiny Dog Paws: 340% ROAS and 56 New Appointments in the First Month',
      metrics: [
        { label: 'New Clients', value: '56' },
        { label: 'Revenue Generated', value: '$5,040' },
        { label: 'Return on Ad Spend', value: '340%' }
      ],
      clientInfo: {
        name: 'Rose Yanke',
        position: 'Founder',
        company: 'Shiny Dog Paws',
        testimonial: 'Christian didn\'t just get me clients; he gave me the confidence to build the business I always dreamed of.'
      },
      overview: 'Shiny Dog Paws offers comprehensive mobile grooming services covering Florida\'s treasure coast. They cover every aspect of dog\'s well-being as well as their owners peace of mind. From a relaxing bath and expert haircut to essential nail trimming and ear cleaning, Shiny Dog Paws provide a stress-free, personalized experience right at their clients doorstep.',
      challenge: 'Rose had the skills and the van, but no real plan to attract clients. She was feeling overwhelmed and unsure how to get her business off the ground.',
      solutions: [
        'Built a User-Friendly Website with integrated online booking through Square Appointments',
        'Boosted Local Visibility through optimized Google Business Profile and listings',
        'Created a Social Media Presence to connect with the community',
        'Launched Targeted Ad Campaigns on Google Ads and Yelp'
      ],
      results: [
        'Fully booked from day one of launch',
        'Consistent 5-star Google rating',
        'Strong organic traffic growth',
        '$5,040 additional monthly revenue'
      ]
    }
  };

  const study = caseStudies[id];

  if (!study) {
    return (
      <Container>
        <Typography variant="h2">Case Study Not Found</Typography>
      </Container>
    );
  }

  return (
    <Box sx={{ py: 8 }}>
        <MetaTags
        title="Case Studies"
        description="Discover how we've helped businesses achieve their digital goals with our expertise in web development, SEO, copywriting, and design."
      />
      <Container maxWidth="lg">
        <Section>
          <Typography variant="h1" gutterBottom>
            {study.title}
          </Typography>
          
          <Grid container spacing={4} sx={{ mt: 4 }}>
            {study.metrics.map((metric) => (
              <Grid item xs={12} md={4} key={metric.label}>
                <MetricCard elevation={2}>
                  <Typography variant="h3" color="primary">
                    {metric.value}
                  </Typography>
                  <Typography variant="h6" color="textSecondary">
                    {metric.label}
                  </Typography>
                </MetricCard>
              </Grid>
            ))}
          </Grid>
        </Section>

        <Section>
          <Typography variant="h4" gutterBottom color="primary">
            Overview
          </Typography>
          <Typography variant="body1" paragraph>
            {study.overview}
          </Typography>

          <TestimonialBox elevation={2}>
            <Typography variant="body1" paragraph sx={{ fontStyle: 'italic', fontSize: '1.2rem' }}>
              "{study.clientInfo.testimonial}"
            </Typography>
            <Typography variant="subtitle1" color="primary">
              {study.clientInfo.name}
            </Typography>
            <Typography variant="subtitle2" color="textSecondary">
              {study.clientInfo.position} at {study.clientInfo.company}
            </Typography>
          </TestimonialBox>
        </Section>

        <Section>
          <Typography variant="h4" gutterBottom color="primary">
            The Challenge
          </Typography>
          <Typography variant="body1" paragraph>
            {study.challenge}
          </Typography>
        </Section>

        <Section>
          <Typography variant="h4" gutterBottom color="primary">
            Our Solution
          </Typography>
          <Box sx={{ mt: 3 }}>
            {study.solutions.map((solution, index) => (
              <Typography key={index} variant="body1" sx={{ mb: 2 }}>
                • {solution}
              </Typography>
            ))}
          </Box>
        </Section>

        <Section>
          <Typography variant="h4" gutterBottom color="primary">
            The Results
          </Typography>
          <Box sx={{ mt: 3 }}>
            {study.results.map((result, index) => (
              <Typography key={index} variant="body1" sx={{ mb: 2 }}>
                • {result}
              </Typography>
            ))}
          </Box>
        </Section>

        <Box sx={{ mt: 8, textAlign: 'center' }}>
          <Typography variant="h4" gutterBottom>
            Ready to Grow Your Business?
          </Typography>
          <Button
            variant="contained"
            color="primary"
            size="large"
            component={RouterLink}
            to="/contact"
            sx={{ mt: 2 }}
          >
            Schedule a Free Consultation
          </Button>
        </Box>
      </Container>
    </Box>
  );
};

export default CaseStudy;